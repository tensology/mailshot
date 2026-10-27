import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';
import { getAuthToken, useAuth } from '../context/AuthContext';
import MailshotIcon from './ui/MailshotIcon';
import ConfirmDialog from './common/ConfirmDialog';

// Dev agent: prompt an AI coding agent against the PlanMyCharter repo. Threads on
// the left, live streamed output on the right, files/images attachable, and a
// per-user switch for auto-deploy (off by default; commit + deploy on approval).
const STORAGE_OPEN = 'mailshot:devagent-open';
const STORAGE_THREAD = 'mailshot:devagent-thread';

const buildWsUrl = (token) => {
    const base = API_URL && /^https?:/i.test(API_URL) ? new URL(API_URL) : new URL(window.location.origin);
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${base.host}/dev-agent/ws?token=${encodeURIComponent(token)}`;
};

const fileLabel = (name) => String(name || 'file').replace(/^[0-9a-f]{8}-/, '');

const TOOL_LABELS = {
    read: 'Reading the files',
    bash: 'Running a command',
    edit: 'Editing the files',
    write: 'Writing files'
};

const STEPS = [
    { key: 'thinking', label: 'Thinking' },
    { key: 'developing', label: 'Making changes' },
    { key: 'deploying', label: 'Putting it live' }
];
const PHASE_INDEX = { thinking: 0, developing: 1, deploying: 2, done: 3 };

const SUGGESTIONS = [
    'Make the dashboard heading bigger',
    'Change the main button colour',
    'Fix the wording on the homepage',
    'Add a new field to the charter form'
];

// Real hover tooltip (not the browser's default title tooltip).
const Tooltip = ({ label, children }) => (
    <span className="group/tip relative inline-flex">
        {children}
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
            {label}
        </span>
    </span>
);

const DevAgentPanel = () => {
    const { isAuthenticated } = useAuth();
    const [enabled, setEnabled] = useState(false);
    const [autoDeploy, setAutoDeploy] = useState(false);
    const [open, setOpen] = useState(() => {
        try { return localStorage.getItem(STORAGE_OPEN) === '1'; } catch { return false; }
    });
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState(() => {
        try { return localStorage.getItem(STORAGE_THREAD) || ''; } catch { return ''; }
    });
    const [messages, setMessages] = useState([]);
    const [streamText, setStreamText] = useState('');
    const [tool, setTool] = useState('');
    const [phase, setPhase] = useState('idle');
    const [processLog, setProcessLog] = useState([]);
    const [running, setRunning] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [files, setFiles] = useState([]);
    const [notice, setNotice] = useState('');
    const [dragging, setDragging] = useState(false);
    const [threadToDelete, setThreadToDelete] = useState(null);
    const [deployable, setDeployable] = useState(false);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const fileInputRef = useRef(null);
    const scrollRef = useRef(null);
    const activeThreadRef = useRef(activeThreadId);
    const autoDeployRef = useRef(false);
    const reconnectRef = useRef(null);

    useEffect(() => { autoDeployRef.current = autoDeploy; }, [autoDeploy]);

    const loadSettings = useCallback(async () => {
        try {
            const response = await API(API_URLS.getDevSettings, {}, '');
            setEnabled(Boolean(response.data?.enabled));
            setAutoDeploy(Boolean(response.data?.auto_deploy));
            // If a run is already going for the thread we restored, pick it back up.
            if (response.data?.running && response.data?.running_thread_id && response.data.running_thread_id === activeThreadRef.current) {
                setRunning(true);
                setPhase('developing');
            }
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

    // Remember the panel + thread so a refresh drops you back exactly where you were.
    useEffect(() => {
        try {
            if (open) localStorage.setItem(STORAGE_OPEN, '1');
            else localStorage.removeItem(STORAGE_OPEN);
        } catch { /* ignore */ }
    }, [open]);

    useEffect(() => {
        activeThreadRef.current = activeThreadId;
        try {
            if (activeThreadId) localStorage.setItem(STORAGE_THREAD, activeThreadId);
            else localStorage.removeItem(STORAGE_THREAD);
        } catch { /* ignore */ }
    }, [activeThreadId]);

    // Restore the saved thread on load.
    useEffect(() => {
        if (isAuthenticated && enabled && activeThreadRef.current) {
            loadMessages(activeThreadRef.current);
        }
    }, [isAuthenticated, enabled, loadMessages]);

    const pushProcess = useCallback((label) => {
        setProcessLog((log) => (log[log.length - 1] === label ? log : [...log.slice(-8), label]));
    }, []);

    const handleEvent = useCallback((data) => {
        if (data.type === 'agent') {
            const ev = data.event || {};
            if (ev.type === 'delta') {
                setPhase('developing');
                setStreamText((value) => value + ev.text);
            } else if (ev.type === 'tool') {
                const name = ev.name || 'tool';
                setTool(name);
                setPhase('developing');
                pushProcess(TOOL_LABELS[name] || `Working (${name})`);
            }
        } else if (data.type === 'message') {
            setMessages((list) => {
                const next = [...list];
                if (data.message?.role === 'user') {
                    const idx = next.findIndex((entry) => entry.local && entry.content === data.message.content);
                    if (idx >= 0) {
                        next[idx] = data.message;
                        return next;
                    }
                }
                next.push(data.message);
                return next;
            });
            if (data.message?.role === 'assistant') {
                setStreamText('');
                setTool('');
                setPhase('done');
            }
        } else if (data.type === 'diff') {
            setDeployable(Boolean(data.changed));
            setNotice(data.changed ? 'Ready to go live' : 'Nothing changed yet');
            setPhase(autoDeployRef.current ? 'deploying' : 'done');
        } else if (data.type === 'deploy') {
            setRunning(false);
            setDeployable(false);
            setPhase('done');
            setNotice(data.pushed ? "Done — it's live now" : (data.changed ? 'Could not save it — try again' : 'Nothing to save'));
        } else if (data.type === 'ready_to_deploy') {
            setRunning(false);
            setDeployable(true);
            setPhase('done');
            setNotice('Ready — click Make it live');
        } else if (data.type === 'error') {
            setRunning(false);
            setPhase('done');
            setNotice(data.message || 'Something went wrong — try again');
        }
    }, [pushProcess]);

    // WebSocket with auto-reconnect; resubscribes to the active thread on reopen.
    useEffect(() => {
        if (!enabled || !isAuthenticated) {
            return undefined;
        }
        const token = getAuthToken();
        if (!token) {
            return undefined;
        }
        let closed = false;
        let attempts = 0;
        let socket = null;

        const connect = () => {
            try {
                socket = new WebSocket(buildWsUrl(token));
            } catch {
                return;
            }
            wsRef.current = socket;
            socket.onopen = () => {
                attempts = 0;
                setConnected(true);
                if (activeThreadRef.current) {
                    socket.send(JSON.stringify({ type: 'subscribe', threadId: activeThreadRef.current }));
                }
            };
            socket.onmessage = (event) => {
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                handleEvent(data);
            };
            socket.onclose = () => {
                wsRef.current = null;
                setConnected(false);
                if (closed) {
                    return;
                }
                attempts += 1;
                const delay = Math.min(15000, 800 * attempts);
                reconnectRef.current = setTimeout(connect, delay);
            };
            socket.onerror = () => {
                try { socket.close(); } catch { /* ignore */ }
            };
        };

        connect();
        return () => {
            closed = true;
            if (reconnectRef.current) {
                clearTimeout(reconnectRef.current);
                reconnectRef.current = null;
            }
            try { socket?.close(); } catch { /* ignore */ }
            wsRef.current = null;
            setConnected(false);
        };
    }, [enabled, isAuthenticated, handleEvent]);

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
    }, [messages, streamText, processLog]);

    const subscribe = useCallback((threadId) => {
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'subscribe', threadId }));
        }
    }, []);

    const selectThread = useCallback((threadId) => {
        setActiveThreadId(threadId);
        activeThreadRef.current = threadId;
        setStreamText('');
        setTool('');
        setPhase('idle');
        setProcessLog([]);
        setNotice('');
        setDeployable(false);
        if (threadId) {
            loadMessages(threadId);
        }
    }, [loadMessages]);

    const handleSelectThread = useCallback((threadId) => {
        selectThread(threadId);
        subscribe(threadId);
    }, [selectThread, subscribe]);

    const newThread = useCallback(async () => {
        try {
            const response = await API(API_URLS.createDevThread, { title: 'New change' }, '');
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
        setOpen(true);
        let threadId = activeThreadId;
        if (!threadId) {
            const created = await API(API_URLS.createDevThread, { title: text.slice(0, 60) || 'New change' }, '').catch(() => null);
            threadId = created?.data?.id;
            if (!threadId) {
                setNotice('Could not start — try again');
                return;
            }
            setThreads((list) => [created.data, ...list]);
            selectThread(threadId);
            subscribe(threadId);
        }

        const form = new FormData();
        form.append('prompt', text || 'Review the attached file(s) and act on them.');
        files.forEach((file) => form.append('attachments', file));

        const optimistic = {
            id: `local-${Date.now()}`,
            role: 'user',
            content: text || 'Review the attached file(s) and act on them.',
            meta: { attachments: files.map((file) => file.name) },
            created_at: new Date().toISOString(),
            local: true
        };
        setMessages((list) => [...list, optimistic]);
        setPrompt('');
        setFiles([]);
        setStreamText('');
        setTool('');
        setProcessLog([]);
        setNotice('');
        setDeployable(false);
        setPhase('thinking');
        setRunning(true);
        try {
            await API(API_URLS.postDevPrompt, form, threadId);
        } catch (error) {
            setRunning(false);
            setPhase('idle');
            setNotice(error?.response?.data || 'Could not start — try again');
        }
    }, [prompt, files, activeThreadId, selectThread, subscribe]);

    const applyDeploy = useCallback(async () => {
        if (!activeThreadId) return;
        setPhase('deploying');
        setNotice('Saving and putting it live…');
        try {
            const response = await API(API_URLS.applyDev, { message: prompt.trim().slice(0, 80) }, activeThreadId);
            setDeployable(false);
            setPhase('idle');
            setNotice(response.data?.pushed ? "Done — it's live now" : 'Nothing to save');
        } catch (error) {
            setPhase('idle');
            setNotice(error?.response?.data || 'Could not put it live — try again');
        }
    }, [activeThreadId, prompt]);

    const handleDeleteThread = useCallback(async () => {
        const target = threadToDelete;
        if (!target) {
            return;
        }
        setThreadToDelete(null);
        setThreads((list) => list.filter((thread) => thread.id !== target.id));
        if (activeThreadRef.current === target.id) {
            activeThreadRef.current = '';
            setActiveThreadId('');
            setMessages([]);
            setStreamText('');
        }
        try {
            await API(API_URLS.deleteDevThread, {}, target.id);
        } catch {
            loadThreads();
        }
    }, [threadToDelete, loadThreads]);

    const discard = useCallback(async () => {
        if (!activeThreadId) return;
        try {
            await API(API_URLS.discardDev, {}, activeThreadId);
            setDeployable(false);
            setNotice('Changes undone');
        } catch (error) {
            setNotice(error?.response?.data || 'Could not undo — try again');
        }
    }, [activeThreadId]);

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

    const renderComposer = (expanded = false) => (
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
            <div className="flex items-center gap-1.5">
                <Tooltip label="Attach files">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                        aria-label="Attach files"
                    >
                        <MailshotIcon name="attach" size={32} />
                    </button>
                </Tooltip>
                <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => setFiles((list) => [...list, ...Array.from(event.target.files || [])].slice(0, 10))} />
                <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }}
                    rows={2}
                    placeholder={'Make a change to PlanMyCharter…\nEnter to run · Shift+Enter for a new line'}
                    className="max-h-28 min-h-[2.75rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none"
                />
                <Tooltip label={running ? 'Working…' : 'Run'}>
                    <button
                        type="button"
                        onClick={send}
                        disabled={running}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-slate-100 disabled:opacity-50"
                        aria-label="Run"
                    >
                        <MailshotIcon name="send" size={32} className={running ? 'opacity-60' : ''} />
                    </button>
                </Tooltip>
                <Tooltip label="Auto update">
                    <button
                        type="button"
                        onClick={() => toggleSetting({ auto_deploy: !autoDeploy })}
                        aria-label="Auto update"
                        aria-pressed={autoDeploy}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${autoDeploy ? 'bg-emerald-50' : 'hover:bg-slate-100'}`}
                    >
                        <MailshotIcon name="server" size={32} className={autoDeploy ? '' : 'grayscale opacity-50'} />
                    </button>
                </Tooltip>
                {!expanded && (
                    <Tooltip label="Expand">
                        <button
                            type="button"
                            onClick={() => { setOpen(true); loadThreads(); }}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                            aria-label="Expand"
                        >
                            <MailshotIcon name="expand" size={32} />
                        </button>
                    </Tooltip>
                )}
            </div>
        </div>
    );

    const phaseIndex = PHASE_INDEX[phase] ?? -1;
    const processBubble = (running || streamText || processLog.length > 0) && (
        <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {STEPS.map((step, index) => {
                        const done = phaseIndex > index;
                        const active = phaseIndex === index;
                        return (
                            <span
                                key={step.key}
                                className={`inline-flex items-center gap-1 ${done ? 'text-emerald-600' : active ? 'font-semibold text-blue-600' : 'text-slate-400'}`}
                            >
                                {done ? '✓' : active ? <MailshotIcon name="refresh" size={12} active /> : '○'}
                                {step.label}
                            </span>
                        );
                    })}
                </div>
                {processLog.length > 0 && (
                    <ul className="mb-1 space-y-0.5">
                        {processLog.map((entry, index) => (
                            <li key={`${entry}-${index}`} className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="h-1 w-1 rounded-full bg-slate-400" />
                                {entry}
                            </li>
                        ))}
                    </ul>
                )}
                {streamText && <p className="whitespace-pre-wrap">{streamText}</p>}
            </div>
        </div>
    );

    return (
        <>
            <div className="fixed bottom-4 right-4 z-[75] w-[min(34rem,calc(100vw-2rem))] print:hidden">
                {renderComposer(false)}
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
                                    <div key={thread.id} className="group mb-1 flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleSelectThread(thread.id)}
                                            className={`min-w-0 flex-1 truncate rounded-md px-2.5 py-2 text-left text-sm transition ${thread.id === activeThreadId ? 'bg-blue-100 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}
                                        >
                                            {thread.title || 'Untitled'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setThreadToDelete(thread)}
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 ${thread.id === activeThreadId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                            title="Delete thread"
                                            aria-label={`Delete ${thread.title || 'thread'}`}
                                        >
                                            <MailshotIcon name="delete" size={16} />
                                        </button>
                                    </div>
                                ))}
                                {!threads.length && <p className="px-2 py-4 text-xs text-slate-500">No threads yet.</p>}
                            </div>
                        </aside>

                        <section className="flex min-w-0 flex-1 flex-col">
                            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">Changes to PlanMyCharter</p>
                                    <p className="truncate text-xs text-slate-500">
                                        {activeThread?.title || 'Tell it what you would like changed'}
                                        {!connected ? ' · reconnecting…' : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close">
                                        <MailshotIcon name="close" size={20} />
                                    </button>
                                </div>
                            </header>

                            <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-4 py-4">
                                {!messages.length && !running && (
                                    <div className="mx-auto max-w-md py-8 text-center">
                                        <p className="text-sm font-medium text-slate-700">What would you like to change?</p>
                                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                                            {SUGGESTIONS.map((suggestion) => (
                                                <button
                                                    key={suggestion}
                                                    type="button"
                                                    onClick={() => setPrompt(suggestion)}
                                                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                                >
                                                    {suggestion}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

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

                                {processBubble}
                            </div>

                            <div className="border-t border-slate-200 px-4 py-3">
                                {notice && <p className="mb-2 text-xs text-slate-600">{notice}</p>}
                                {deployable && !autoDeploy && (
                                    <div className="mb-2 flex items-center gap-2">
                                        <button type="button" onClick={applyDeploy} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                            Make it live
                                        </button>
                                        <button type="button" onClick={discard} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                                            Undo changes
                                        </button>
                                    </div>
                                )}
                                {renderComposer(true)}
                            </div>
                        </section>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(threadToDelete)}
                title="Delete thread?"
                message={threadToDelete ? `Delete “${threadToDelete.title || 'this thread'}”? This removes the chat history only, not any code changes already deployed.` : ''}
                confirmLabel="Delete thread"
                onConfirm={handleDeleteThread}
                onCancel={() => setThreadToDelete(null)}
            />
        </>
    );
};

export default DevAgentPanel;
