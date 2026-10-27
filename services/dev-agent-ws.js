import { WebSocketServer } from 'ws';
import { getSession } from './auth-store.js';
import { isAuthConfigured } from './auth-config.js';

// Real-time channel for the dev-agent panel. One room per thread; the runner
// streams deltas/tool events here and the browser renders them live.
const clients = new Map();

export const broadcast = (threadId, payload) => {
    const data = JSON.stringify(payload);
    for (const [ws, meta] of clients.entries()) {
        if (meta.threadId === threadId && ws.readyState === ws.OPEN) {
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
