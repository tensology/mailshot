import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';
import { getAuthToken, useAuth } from '../context/AuthContext';
import MailshotIcon from './ui/MailshotIcon';

// Dev agent: prompt an AI coding agent against the PlanMyCharter repo. Threads on
// the left, live streamed output on the right, files/images attachable, and a
// per-user switch for auto-deploy (off by default; commit + deploy on approval).
const buildWsUrl = (token) => {
    const base = API_URL && /^https?:/i.test(API_URL) ? new URL(API_URL) : new URL(window.location.origin);
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${base.host}/dev-agent/ws?token=${encodeURIComponent(token)}`;
};

const fileLabel = (name) => String(name || 'file').replace(/^[0-9a-f]{8}-/, '');

const DevAgentPanel = () => {
    const { isAuthenticated } = useAuth();
    const [enabled, setEnabled] = useState(false);
    const [autoDeploy, setAutoDeploy] = useState(false);
    const [open, setOpen] = useState(false);
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState('');
    const [messages, setMessages] = useState([]);
    const [streamText, setStreamText] = useState('');
    const [thinking, setThinking] = useState('');
    const [tool, setTool] = useState('');
    const [running, setRunning] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [files, setFiles] = useState([]);
    const [notice, setNotice] = useState('');
    const [dragging, setDragging] = useState(false);
    const wsRef = useRef(null);
    const fileInputRef = useRef(null);
    const scrollRef = useRef(null);
    const activeThreadRef = useRef('');

    const loadSettings = useCallback(async () => {
        try {
            const response = await API(API_URLS.getDevSettings, {}, '');
            setEnabled(Boolean(response.data?.enabled));
            setAutoDeploy(Boolean(response.data?.auto_deploy));
            setRunning(Boolean(response.data?.running));
        } catch {
            setEnabled(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            loadSettings();
        }
    }, [isAuthenticated, loadSettings]);

    const loadThreads = useCallback(async () => {
        try {
            const response = await API(API_URLS.getDevThreads, {}, '');
            const list = Array.isArray(response.data) ? response.data : [];
            setThreads(list);
            return list;
        } catch {
            return [];
        }
    }, []);

    const loadMessages = useCallback(async (threadId) => {
        try {
            const response = await API(API_URLS.getDevMessages, {}, threadId);
            setMessages(Array.isArray(response.data) ? response.data : []);
        } catch {
            setMessages([]);
        }
    }, []);

    const selectThread = useCallback((threadId) => {
        setActiveThreadId(threadId);
        activeThreadRef.current = threadId;
        setStreamText('');
        setThinking('');
        setTool('');
        setNotice('');
        if (threadId) {
            loadMessages(threadId);
        }
    }, [loadMessages]);

    // WebSocket: subscribe to the active thread and stream the agent live.
    useEffect(() => {
        if (!enabled || !isAuthenticated) {
            return undefined;
        }
        const token = getAuthToken();
        if (!token) {
            return undefined;
        }
        let closed = false;
        let socket;
        try {
            socket = new WebSocket(buildWsUrl(token));
        } catch {
            return undefined;
        }
        wsRef.current = socket;
        socket.onopen = () => {
            if (activeThreadRef.current) {
                socket.send(JSON.stringify({ type: 'subscribe', threadId: activeThreadRef.current }));
            }
        };
        socket.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch { return; }
            if (data.type === 'agent') {
                const ev = data.event || {};
                if (ev.type === 'delta') setStreamText((value) => value + ev.text);
                else if (ev.type === 'thinking') setThinking((value) => (value + ev.text).slice(-2000));
                else if (ev.type === 'tool') setTool(ev.name || 'tool');
            } else if (data.type === 'message') {
                setMessages((list) => [...list, data.message]);
                if (data.message?.role === 'assistant') {
                    setStreamText('');
                    setThinking('');
                    setTool('');
                }
            } else if (data.type === 'diff') {
                setNotice(data.changed ? 'Changes ready to deploy' : 'No file changes');
            } else if (data.type === 'deploy') {
                setRunning(false);
                setNotice(data.pushed ? `Deployed ${data.head || ''}` : (data.changed ? 'Commit failed' : 'Nothing to deploy'));
            } else if (data.type === 'ready_to_deploy') {
                setRunning(false);
                setNotice('Changes ready — click Apply & deploy');
            } else if (data.type === 'error') {
                setRunning(false);
                setNotice(data.message || 'Run failed');
            }
        };
        socket.onclose = () => {
            if (!closed) {
                wsRef.current = null;
            }
        };
        return () => {
            closed = true;
            try { socket.close(); } catch { /* ignore */ }
            wsRef.current = null;
        };
    }, [enabled, isAuthenticated]);

    useEffect(() => {
        if (open && !threads.length) {
            loadThreads();
        }
    }, [open, threads.length, loadThreads]);

    useEffect(() => {
        const node = scrollRef.current;
        if (node) {
            node.scrollTop = node.scrollHeight;
        }
    }, [messages, streamText]);

    const subscribe = useCallback((threadId) => {
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'subscribe', threadId }));
        }
    }, []);

    const handleSelectThread = useCallback((threadId) => {
        selectThread(threadId);
        subscribe(threadId);
    }, [selectThread, subscribe]);

    const newThread = useCallback(async () => {
        try {
            const response = await API(API_URLS.createDevThread, { title: 'New thread' }, '');
            const thread = response.data;
            setThreads((list) => [thread, ...list]);
            selectThread(thread.id);
            subscribe(thread.id);
        } catch {
            setNotice('Could not create a thread');
        }
    }, [selectThread, subscribe]);

    const toggleSetting = useCallback(async (patch) => {
        try {
            const response = await API(API_URLS.updateDevSettings, patch, '');
            setEnabled(Boolean(response.data?.enabled));
            setAutoDeploy(Boolean(response.data?.auto_deploy));
        } catch {
            setNotice('Could not save the setting');
        }
    }, []);

    const send = useCallback(async () => {
        const text = prompt.trim();
        if (!text && !files.length) {
            return;
        }
        let threadId = activeThreadId;
        if (!threadId) {
            const created = await API(API_URLS.createDevThread, { title: text.slice(0, 60) || 'New thread' }, '').catch(() => null);
            threadId = created?.data?.id;
            if (!threadId) {
                setNotice('Could not create a thread');
                return;
            }
            setThreads((list) => [created.data, ...list]);
            selectThread(threadId);
            subscribe(threadId);
        }

        const form = new FormData();
        form.append('prompt', text || 'Review the attached file(s) and act on them.');
        files.forEach((file) => form.append('attachments', file));

        setPrompt('');
        setFiles([]);
        setStreamText('');
        setThinking('');
        setTool('');
        setNotice('');
        setRunning(true);
        try {
            await API(API_URLS.postDevPrompt, form, threadId);
        } catch (error) {
            setRunning(false);
            setNotice(error?.response?.data || 'Could not start the run');
        }
    }, [prompt, files, activeThreadId, selectThread, subscribe]);

    const applyDeploy = useCallback(async () => {
        if (!activeThreadId) return;
        setNotice('Committing and deploying…');
        try {
            const response = await API(API_URLS.applyDev, { message: prompt.trim().slice(0, 80) }, activeThreadId);
            setNotice(response.data?.pushed ? `Deployed ${response.data.head || ''}` : 'Nothing to deploy');
        } catch (error) {
            setNotice(error?.response?.data || 'Deploy failed');
        }
    }, [activeThreadId, prompt]);

    const onDrop = useCallback((event) => {
        event.preventDefault();
        setDragging(false);
        const dropped = Array.from(event.dataTransfer?.files || []);
        if (dropped.length) {
            setFiles((list) => [...list, ...dropped].slice(0, 10));
        }
    }, []);

    const activeThread = useMemo(
        () => threads.find((thread) => thread.id === activeThreadId) || null,
        [threads, activeThreadId]
    );

    if (!enabled || !isAuthenticated) {
        return null;
    }

    const composer = (
        <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl border bg-white p-2 shadow-lg transition ${dragging ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}
        >
            {files.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {files.map((file, index) => (
                        <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {fileLabel(file.name)}
                            <button type="button" onClick={() => setFiles((list) => list.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-500">×</button>
                        </span>
                    ))}
                </div>
            )}
            <div className="flex items-end gap-2">
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                    title="Attach files or images"
                    aria-label="Attach files or images"
                >
                    <MailshotIcon name="plus" size={22} />
                </button>
                <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => setFiles((list) => [...list, ...Array.from(event.target.files || [])].slice(0, 10))} />
                <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }}
                    rows={1}
                    placeholder="Ask the dev agent to change PlanMyCharter…"
                    className="max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
                />
                <button
                    type="button"
                    onClick={send}
                    disabled={running}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                    <MailshotIcon name="send" size={18} />
                    {running ? 'Running' : 'Run'}
                </button>
                <button
                    type="button"
                    onClick={() => { setOpen(true); loadThreads(); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                    title="Expand"
                    aria-label="Expand dev agent"
                >
                    <MailshotIcon name="expand" size={20} />
                </button>
            </div>
        </div>
    );

    return (
        <>
            <div className="fixed bottom-4 right-4 z-[75] w-[min(30rem,calc(100vw-2rem))] print:hidden">
                {composer}
            </div>

            {open && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
                    <div className="flex h-[85vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
                            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
                                <span className="text-sm font-semibold text-slate-900">Threads</span>
                                <button type="button" onClick={newThread} className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100" title="New thread">
                                    <MailshotIcon name="plus" size={18} />
                                </button>
                            </div>
                            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
                                {threads.map((thread) => (
                                    <button
                                        key={thread.id}
                                        type="button"
                                        onClick={() => handleSelectThread(thread.id)}
                                        className={`mb-1 block w-full truncate rounded-md px-2.5 py-2 text-left text-sm transition ${thread.id === activeThreadId ? 'bg-blue-100 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}
                                    >
                                        {thread.title || 'Untitled'}
                                    </button>
                                ))}
                                {!threads.length && <p className="px-2 py-4 text-xs text-slate-500">No threads yet.</p>}
                            </div>
                        </aside>

                        <section className="flex min-w-0 flex-1 flex-col">
                            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">{activeThread?.title || 'Dev agent'}</p>
                                    <p className="truncate text-xs text-slate-500">DeepSeek V4.1 Flash · PlanMyCharter</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <input type="checkbox" checked={autoDeploy} onChange={(event) => toggleSetting({ auto_deploy: event.target.checked })} />
                                        Auto-deploy
                                    </label>
                                    <button type="button" onClick={() => toggleSetting({ enabled: false })} className="text-xs text-slate-500 hover:text-slate-800">Turn off</button>
                                    <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close">
                                        <MailshotIcon name="close" size={20} />
                                    </button>
                                </div>
                            </header>

                            <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-4 py-4">
                                {messages.map((message) => (
                                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                                            {message.content}
                                            {Array.isArray(message.meta?.attachments) && message.meta.attachments.length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {message.meta.attachments.map((name) => (
                                                        <span key={name} className={`rounded-full px-2 py-0.5 text-[11px] ${message.role === 'user' ? 'bg-blue-500/60' : 'bg-slate-200'}`}>{fileLabel(name)}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {(streamText || tool) && (
                                    <div className="flex justify-start">
                                        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                                            {tool && <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">using {tool}</p>}
                                            {streamText}
                                            {!streamText && <span className="inline-flex items-center gap-1 text-slate-500"><MailshotIcon name="refresh" size={16} active /> working…</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-slate-200 px-4 py-3">
                                {notice && <p className="mb-2 text-xs text-slate-600">{notice}</p>}
                                {notice.startsWith('Changes ready') && !autoDeploy && (
                                    <button type="button" onClick={applyDeploy} className="mb-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                        Apply &amp; deploy
                                    </button>
                                )}
                                {composer}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </>
    );
};

export default DevAgentPanel;
