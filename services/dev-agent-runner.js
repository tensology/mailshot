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
// A scratch "bucket" inside the worktree so the agent can see, crop, rename and
// copy uploaded files (images, PDFs, anything) with ordinary tools.
const BUCKET_NAME = '.devagent-files';
const BUCKET = path.join(WORKTREE, BUCKET_NAME);
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
// Set while a commit + deploy is in flight, so the run still reads as "running"
// after the agent process exits but before the site is live.
let deploying = null;

export const markDeploying = (threadId) => {
    deploying = { threadId: String(threadId || ''), startedAt: Date.now() };
};

export const clearDeploying = () => {
    deploying = null;
};

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

// A run counts as live only while its process really is. If the process died
// without clearing the flag (crash, OOM, service restart) we recover instead of
// blocking every future prompt.
export const isRunning = () => {
    if (active) {
        const child = active.child;
        const dead = !child || child.exitCode !== null || child.signalCode !== null || child.killed;
        const stale = Date.now() - active.startedAt > MAX_MS + 60 * 1000;
        if (dead || stale) {
            try { child?.kill('SIGKILL'); } catch { /* ignore */ }
            active = null;
        } else {
            return true;
        }
    }
    if (deploying) {
        if (Date.now() - deploying.startedAt > 10 * 60 * 1000) {
            deploying = null;
        } else {
            return true;
        }
    }
    return false;
};

export const currentRun = () => {
    if (!isRunning()) {
        return null;
    }
    const run = active || deploying;
    return { threadId: run.threadId, startedAt: run.startedAt };
};

// Keep the scratch bucket out of git without touching the project's own .gitignore.
const ensureBucket = async () => {
    fs.mkdirSync(BUCKET, { recursive: true });
    try {
        const resolved = await git(['rev-parse', '--git-path', 'info/exclude']);
        if (!resolved.ok || !resolved.stdout) return;
        const target = path.isAbsolute(resolved.stdout) ? resolved.stdout : path.resolve(WORKTREE, resolved.stdout);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
        if (!current.split('\n').some((line) => line.trim() === `${BUCKET_NAME}/`)) {
            fs.writeFileSync(target, `${current.replace(/\s*$/, '')}\n${BUCKET_NAME}/\n`);
        }
    } catch { /* ignore */ }
};

export const ensureWorktree = async () => {
    fs.mkdirSync(ROOT, { recursive: true });
    fs.mkdirSync(HOME, { recursive: true });
    fs.mkdirSync(SESSIONS, { recursive: true });
    if (!fs.existsSync(path.join(WORKTREE, '.git'))) {
        // Share the object store with the live checkout; no extra clone.
        await execFileAsync('git', ['-C', MAIN_CHECKOUT, 'fetch', 'origin', '--prune'], { maxBuffer: 20 * 1024 * 1024 });
        await execFileAsync('git', ['-C', MAIN_CHECKOUT, 'worktree', 'add', '-B', BRANCH, WORKTREE, 'origin/main'], { maxBuffer: 20 * 1024 * 1024 });
    }
    await ensureBucket();
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

const truthy = (value) => String(value).toLowerCase() === 'true';

// Provider usage is reported per assistant response, so totals are summed.
const addUsage = (base = {}, extra = {}) => {
    const num = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const cost = typeof extra?.cost === 'number' ? extra.cost : num(extra?.cost?.total);
    return {
        cost: num(base.cost) + cost,
        input: num(base.input) + num(extra.input),
        output: num(base.output) + num(extra.output),
        cacheRead: num(base.cacheRead) + num(extra.cacheRead),
        cacheWrite: num(base.cacheWrite) + num(extra.cacheWrite),
        totalTokens: num(base.totalTokens) + num(extra.totalTokens)
    };
};

const parseEvent = (event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent) {
        const ev = event.assistantMessageEvent;
        if (ev.type === 'text_delta' && ev.delta) return { type: 'delta', text: ev.delta };
        if (ev.type === 'thinking_delta' && ev.delta) return { type: 'thinking', text: ev.delta };
        return null;
    }
    if (event.type === 'tool_execution_start') {
        return { type: 'tool_start', id: event.toolCallId || '', name: event.toolName || 'tool' };
    }
    if (event.type === 'tool_execution_end') {
        return { type: 'tool_end', id: event.toolCallId || '', name: event.toolName || 'tool', ok: !truthy(event.isError) };
    }
    // Long runs: pi summarises old context (and retries hiccups) on its own.
    if (event.type === 'compaction_start') {
        return { type: 'notice', text: event.reason === 'overflow' ? 'The conversation got long — tidying it up so it can keep going…' : 'Tidying up the conversation so it can keep going…' };
    }
    if (event.type === 'compaction_end') {
        return { type: 'notice', text: event.aborted ? 'Tidying up was stopped.' : 'Tidied up — carrying on.' };
    }
    if (event.type === 'auto_retry_start') {
        return { type: 'notice', text: 'That attempt hiccupped — trying again…' };
    }
    if (event.type === 'auto_retry_end' && event.success === false) {
        return { type: 'error', text: event.finalError || 'The agent could not finish this change.' };
    }
    if (event.type === 'agent_settled' && event.aborted === true) {
        return { type: 'error', text: 'The run was stopped before it finished.' };
    }
    return null;
};

export const uploadsDir = (threadId) => path.join(BUCKET, String(threadId || 'thread'));

export const runAgent = async ({ threadId, prompt, attachments = [], onEvent = () => {} }) => {
    if (isRunning()) {
        throw new Error('Another dev-agent run is in progress');
    }
    active = null;
    await prepareWorktree();

    const settings = await getSettings();
    const apiKey = String(settings.ai?.api_key || '').trim();
    if (!apiKey) {
        throw new Error('No OpenRouter key configured for this mailbox');
    }

    const fileList = (Array.isArray(attachments) ? attachments : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    const fileRefs = fileList.map((filePath) => `@${filePath}`);
    const attachmentNote = fileList.length
        ? [
            '',
            'The user attached these files (already on disk, absolute paths):',
            ...fileList.map((filePath) => `- ${filePath}`),
            'You may open, inspect, crop, rotate, OCR, rename or copy them wherever they are needed.',
            'Tools available: pdftotext, pdfinfo, pdftoppm, tesseract, ffmpeg, and python3 with fitz (PyMuPDF) and PIL.',
            'If the user wants an attached file used on the website, copy it into the right folder and commit it like any other change.',
            'If it is not clear what to do with a file, ask a short plain-English question before moving on.'
        ].join('\n')
        : '';
    const fullPrompt = `${prompt}${attachmentNote}`;

    const args = [
        '--print', '--mode', 'json',
        '--session-id', threadId,
        '--session-dir', SESSIONS,
        '--provider', PROVIDER,
        '--model', MODEL,
        '--api-key', apiKey,
        '--append-system-prompt', LAYMAN_SYSTEM_PROMPT,
        ...fileRefs,
        fullPrompt
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
    let runUsage = {};
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

        // Real cost/token numbers from the provider: `message_update` carries the
        // running total for the response in flight, `message_end` is authoritative.
        if (event.type === 'message_update' && event.usage) {
            onEvent({ type: 'usage', usage: addUsage(runUsage, event.usage), live: true });
        } else if (event.type === 'message_end' && event.message?.role === 'assistant' && event.message.usage) {
            runUsage = addUsage(runUsage, event.message.usage);
            onEvent({ type: 'usage', usage: runUsage, live: false });
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

    let code = -1;
    try {
        code = await new Promise((resolve) => child.on('close', resolve));
        if (buffer.trim()) {
            handleLine(buffer);
        }
        return { ok: code === 0, code, text: assistantText, usage: runUsage };
    } finally {
        // Always release the lock, whatever happened to the child.
        clearTimeout(timeout);
        if (active && active.child === child) {
            active = null;
        }
        await touchThread(threadId, { status: code === 0 ? 'idle' : 'error' }).catch(() => {});
    }
};

export const diffSummary = async () => {
    const status = await git(['status', '--porcelain']);
    const stat = await git(['diff', '--stat']);
    return { changed: Boolean(status.stdout), status: status.stdout.slice(0, 20000), diffstat: stat.stdout.slice(0, 20000) };
};

export const commitAndDeploy = async ({ threadId, message }) => {
    const head = (await git(['rev-parse', 'HEAD'])).stdout;
    const originMain = (await git(['rev-parse', 'origin/main'])).stdout;
    const status = await git(['status', '--porcelain']);
    const dirty = Boolean(status.stdout);
    // The agent sometimes commits its own work. That still has to ship, so push
    // whenever the branch is ahead of origin/main, not only when files are dirty.
    if (!dirty && (!head || head === originMain)) {
        return { changed: false, committed: false, pushed: false };
    }
    let committed = false;
    if (dirty) {
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
        committed = true;
    }
    const push = await git(['push', 'origin', 'HEAD:main']);
    return {
        changed: true,
        committed,
        pushed: push.ok,
        error: push.ok ? '' : push.stderr,
        head: (await git(['rev-parse', '--short', 'HEAD'])).stdout
    };
};
