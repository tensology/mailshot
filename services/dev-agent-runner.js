import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { touchThread } from './dev-agent-store.js';
import { getSettings } from './settings-store.js';

const execFileAsync = promisify(execFile);

// The agent edits an isolated git worktree of the PlanMyCharter repo (never the
// live checkout), then commits and pushes to main, which triggers the existing
// git-auto-deploy hook (frontend build + Django migrate/collectstatic + restart).
const ROOT = process.env.MAILSHOT_DEVAGENT_ROOT || '/opt/mailshot-devagent';
const MAIN_CHECKOUT = process.env.MAILSHOT_DEVAGENT_CHECKOUT || '/var/www/planmycharter.com';
const WORKTREE = path.join(ROOT, 'worktree');
const HOME = path.join(ROOT, 'home');
const SESSIONS = path.join(ROOT, 'sessions');
const BRANCH = 'mailshot-devagent';
const PROVIDER = process.env.MAILSHOT_DEVAGENT_PROVIDER || 'openrouter';
const MODEL = process.env.MAILSHOT_DEVAGENT_MODEL || 'deepseek/deepseek-v4.1-flash';
const MAX_MS = Number(process.env.MAILSHOT_DEVAGENT_TIMEOUT_MS || 25 * 60 * 1000);

// The owner is not a developer - keep the conversation plain and human.
const LAYMAN_SYSTEM_PROMPT = [
    'You are working for a non-technical business owner.',
    'Talk to them in plain, everyday language. Do not mention file names, code, function names, CSS, commits or other jargon unless they explicitly ask.',
    'Describe changes in terms of what they will see on the screen.',
    'Keep replies short, warm and easy to follow.',
    'Never say something is done unless you have actually checked it. If a change was lost or failed, say so plainly.'
].join(' ');

let active = null;

const git = async (args, cwd = WORKTREE) => {
    try {
        const { stdout, stderr } = await execFileAsync('git', args, { cwd, maxBuffer: 20 * 1024 * 1024 });
        return { ok: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
    } catch (error) {
        return {
            ok: false,
            stdout: (error.stdout || '').trim(),
            stderr: (error.stderr || error.message || '').trim(),
            code: error.code
        };
    }
};

export const isRunning = () => Boolean(active);

export const currentRun = () => (active ? { threadId: active.threadId, startedAt: active.startedAt } : null);

export const ensureWorktree = async () => {
    fs.mkdirSync(ROOT, { recursive: true });
    fs.mkdirSync(HOME, { recursive: true });
    fs.mkdirSync(SESSIONS, { recursive: true });
    if (fs.existsSync(path.join(WORKTREE, '.git'))) {
        return;
    }
    // Share the object store with the live checkout; no extra clone.
    await execFileAsync('git', ['-C', MAIN_CHECKOUT, 'fetch', 'origin', '--prune'], { maxBuffer: 20 * 1024 * 1024 });
    await execFileAsync('git', ['-C', MAIN_CHECKOUT, 'worktree', 'add', '-B', BRANCH, WORKTREE, 'origin/main'], { maxBuffer: 20 * 1024 * 1024 });
};

// Never reset the worktree between runs - the agent's edits must survive so a
// follow-up turn can build on them. A clean slate only happens after a deploy
// (commit) or an explicit discard.
const prepareWorktree = async () => {
    await ensureWorktree();
    await git(['fetch', 'origin', '--prune']);
};

export const discardChanges = async () => {
    await git(['reset', '--hard', 'HEAD']);
    await git(['clean', '-fd']);
    return diffSummary();
};

const parseEvent = (event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent) {
        const ev = event.assistantMessageEvent;
        if (ev.type === 'text_delta' && ev.delta) return { type: 'delta', text: ev.delta };
        if (ev.type === 'thinking_delta' && ev.delta) return { type: 'thinking', text: ev.delta };
        return null;
    }
    if (event.type === 'tool_start' || event.type === 'tool_call') {
        return { type: 'tool', name: event.name || event.toolName || event.tool || 'tool' };
    }
    return null;
};

export const uploadsDir = (threadId) => path.join(ROOT, 'uploads', String(threadId || 'thread'));

export const runAgent = async ({ threadId, prompt, attachments = [], onEvent = () => {} }) => {
    if (active) {
        throw new Error('Another dev-agent run is in progress');
    }
    await prepareWorktree();

    const settings = await getSettings();
    const apiKey = String(settings.ai?.api_key || '').trim();
    if (!apiKey) {
        throw new Error('No OpenRouter key configured for this mailbox');
    }

    const fileRefs = (Array.isArray(attachments) ? attachments : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .map((filePath) => `@${filePath}`);

    const args = [
        '--print', '--mode', 'json',
        '--session-id', threadId,
        '--session-dir', SESSIONS,
        '--provider', PROVIDER,
        '--model', MODEL,
        '--api-key', apiKey,
        '--append-system-prompt', LAYMAN_SYSTEM_PROMPT,
        ...fileRefs,
        prompt
    ];

    const child = spawn('pi', args, {
        cwd: WORKTREE,
        env: {
            ...process.env,
            HOME,
            XDG_CONFIG_HOME: path.join(HOME, '.config'),
            MAILSHOT_DEVAGENT: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    active = { threadId, child, startedAt: Date.now() };
    await touchThread(threadId, { status: 'running' });

    let assistantText = '';
    let buffer = '';
    const handleLine = (line) => {
        const text = line.trim();
        if (!text) return;
        let event;
        try {
            event = JSON.parse(text);
        } catch {
            onEvent({ type: 'raw', text: text.slice(0, 4000) });
            return;
        }
        const parsed = parseEvent(event);
        if (parsed) {
            if (parsed.type === 'delta') assistantText += parsed.text;
            onEvent(parsed);
        }
    };

    child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
            handleLine(buffer.slice(0, idx));
            buffer = buffer.slice(idx + 1);
        }
    });
    child.stderr.on('data', (chunk) => onEvent({ type: 'stderr', text: chunk.toString('utf8').slice(0, 4000) }));

    const timeout = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, MAX_MS);

    const code = await new Promise((resolve) => child.on('close', resolve));
    clearTimeout(timeout);
    if (buffer.trim()) handleLine(buffer);

    active = null;
    await touchThread(threadId, { status: code === 0 ? 'idle' : 'error' });
    return { ok: code === 0, code, text: assistantText };
};

export const diffSummary = async () => {
    const status = await git(['status', '--porcelain']);
    const stat = await git(['diff', '--stat']);
    return { changed: Boolean(status.stdout), status: status.stdout.slice(0, 20000), diffstat: stat.stdout.slice(0, 20000) };
};

export const commitAndDeploy = async ({ threadId, message }) => {
    const status = await git(['status', '--porcelain']);
    if (!status.stdout) {
        return { changed: false, committed: false, pushed: false };
    }
    await git(['add', '-A']);
    const commitMessage = String(message || `Mailshot dev-agent: ${threadId}`).slice(0, 100);
    const commit = await git([
        '-c', 'user.email=support@tensology.com',
        '-c', 'user.name=Mailshot Dev Agent',
        'commit', '-m', commitMessage
    ]);
    if (!commit.ok) {
        return { changed: true, committed: false, pushed: false, error: commit.stderr };
    }
    const push = await git(['push', 'origin', 'HEAD:main']);
    return {
        changed: true,
        committed: true,
        pushed: push.ok,
        error: push.ok ? '' : push.stderr,
        head: (await git(['rev-parse', '--short', 'HEAD'])).stdout
    };
};
