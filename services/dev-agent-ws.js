import { WebSocketServer } from 'ws';
import { getSession } from './auth-store.js';
import { isAuthConfigured } from './auth-config.js';

// Real-time channel for the dev-agent panel. One room per thread; the runner
// streams deltas/tool events here and the browser renders them live.
const clients = new Map();

// Recent agent events per thread, so a browser that joins (or reconnects) mid-run
// still sees the live progress instead of an empty stream.
const history = new Map();
const HISTORY_MAX = 600;

const replayHistory = (ws, threadId) => {
    const list = history.get(String(threadId || '')) || [];
    for (const payload of list) {
        try { ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
    }
};

export const broadcast = (threadId, payload) => {
    const key = String(threadId || '');
    if (!key) {
        return;
    }
    if (payload?.type === 'agent') {
        const list = history.get(key) || [];
        list.push(payload);
        if (list.length > HISTORY_MAX) {
            list.splice(0, list.length - HISTORY_MAX);
        }
        history.set(key, list);
    } else if (payload?.type === 'message' && payload.message?.role === 'assistant') {
        history.delete(key);
    }

    const data = JSON.stringify(payload);
    for (const [ws, meta] of clients.entries()) {
        if (meta.threadId === key && ws.readyState === ws.OPEN) {
            try { ws.send(data); } catch { /* ignore */ }
        }
    }
};

export const attachDevAgentWebSocket = (server) => {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        let url;
        try {
            url = new URL(request.url, 'http://localhost');
        } catch {
            socket.destroy();
            return;
        }
        if (url.pathname !== '/dev-agent/ws') {
            socket.destroy();
            return;
        }
        const token = url.searchParams.get('token') || '';
        const session = getSession(token);
        if (!isAuthConfigured() || !session) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            clients.set(ws, { username: session.username, threadId: '' });
            ws.send(JSON.stringify({ type: 'hello', username: session.username }));
            ws.on('message', (raw) => {
                let message;
                try { message = JSON.parse(raw.toString()); } catch { return; }
                const meta = clients.get(ws);
                if (!meta) return;
                if (message.type === 'subscribe') {
                    meta.threadId = String(message.threadId || '');
                    ws.send(JSON.stringify({ type: 'subscribed', threadId: meta.threadId }));
                    replayHistory(ws, meta.threadId);
                } else if (message.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                }
            });
            ws.on('pong', () => {
                const meta = clients.get(ws);
                if (meta) meta.awaitingPong = false;
            });
            ws.on('close', () => clients.delete(ws));
            ws.on('error', () => clients.delete(ws));
        });
    });

    // Keep connections alive through proxies and drop dead ones.
    const heartbeat = setInterval(() => {
        for (const [ws, meta] of clients.entries()) {
            if (ws.readyState !== ws.OPEN) {
                clients.delete(ws);
                continue;
            }
            if (meta.awaitingPong) {
                try { ws.terminate(); } catch { /* ignore */ }
                clients.delete(ws);
                continue;
            }
            meta.awaitingPong = true;
            try { ws.ping(); } catch { /* ignore */ }
        }
    }, 30000);
    heartbeat.unref?.();
    wss.on('close', () => clearInterval(heartbeat));

    return wss;
};

export const devAgentClientCount = () => clients.size;
