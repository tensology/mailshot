import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { summarizeEmailWithSettings } from './ai-provider.js';
import { buildSummaryPrompt, getStoredEmailSummary } from './email-summary-service.js';
import { getSettings } from './settings-store.js';
import { hasSummaryProviderConfigured } from './ai-provider.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.resolve(__dirname, '../storage/tts');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const AUDIO_EXTENSION = 'ogg';
const MODEL_ID = process.env.KOKORO_MODEL_ID || 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_DTYPE = process.env.KOKORO_DTYPE || 'q8';
const KOKORO_DEVICE = process.env.KOKORO_DEVICE || 'cpu';
const KOKORO_VOICE = process.env.KOKORO_VOICE || 'af_heart';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const OGG_BITRATE = process.env.KOKORO_OGG_BITRATE || '48k';

const jobs = new Map();
let kokoroModelPromise = null;
let cleanupTimer = null;

const ensureStorageDir = () => {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
};

const hashValue = (value = '') => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 32);

const getCacheKey = (email, settings) => hashValue(JSON.stringify({
    id: String(email._id || ''),
    subject: email.subject || '',
    body: email.body || email.body_html || '',
    provider: settings.ai?.provider || '',
    model: settings.ai?.model || '',
    voice: KOKORO_VOICE
}));

const getJobSnapshot = (job) => ({
    job_id: job.job_id,
    status: job.status,
    summary: job.summary || '',
    audio_url: job.status === 'ready' ? `/read-aloud/audio/${job.filename}` : '',
    error: job.error || ''
});

const getCachedJob = (cacheKey) => {
    const filename = `${cacheKey}.${AUDIO_EXTENSION}`;
    const filePath = path.join(STORAGE_DIR, filename);
    const metaPath = path.join(STORAGE_DIR, `${cacheKey}.json`);

    if (!fs.existsSync(filePath) || !fs.existsSync(metaPath)) {
        return null;
    }

    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) {
        return null;
    }

    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        return {
            job_id: cacheKey,
            status: 'ready',
            filename,
            summary: meta.summary || ''
        };
    } catch {
        return {
            job_id: cacheKey,
            status: 'ready',
            filename,
            summary: ''
        };
    }
};

const getKokoroModel = async () => {
    if (!kokoroModelPromise) {
        kokoroModelPromise = import('kokoro-js').then(({ KokoroTTS }) => (
            KokoroTTS.from_pretrained(MODEL_ID, {
                dtype: KOKORO_DTYPE,
                device: KOKORO_DEVICE
            })
        ));
    }
    return kokoroModelPromise;
};

const createJob = (cacheKey) => {
    const filename = `${cacheKey}.${AUDIO_EXTENSION}`;
    return {
        job_id: cacheKey,
        status: 'queued',
        filename,
        filePath: path.join(STORAGE_DIR, filename),
        metaPath: path.join(STORAGE_DIR, `${cacheKey}.json`),
        summary: '',
        error: ''
    };
};

const generateAudioForSummary = async (job, summary) => {
    const wavPath = path.join(STORAGE_DIR, `${job.job_id}.wav`);
    const tts = await getKokoroModel();
    const audio = await tts.generate(summary, {
        voice: KOKORO_VOICE,
        speed: 1
    });

    ensureStorageDir();
    await audio.save(wavPath);
    await execFileAsync(FFMPEG_PATH, [
        '-y',
        '-i',
        wavPath,
        '-c:a',
        'libopus',
        '-b:a',
        OGG_BITRATE,
        '-vbr',
        'on',
        job.filePath
    ]);
    fs.rmSync(wavPath, { force: true });
    fs.writeFileSync(job.metaPath, JSON.stringify({
        summary,
        created_at: new Date().toISOString()
    }));
};

const processJob = async (job, email, settings, summaryText = '') => {
    const wavPath = path.join(STORAGE_DIR, `${job.job_id}.wav`);

    try {
        job.status = 'processing';
        const storedSummary = summaryText || getStoredEmailSummary(email);
        const summary = storedSummary || await summarizeEmailWithSettings({
            settings,
            prompt: buildSummaryPrompt(email)
        });

        job.summary = summary;
        await generateAudioForSummary(job, summary);
        job.status = 'ready';
        return getJobSnapshot(job);
    } catch (error) {
        job.status = 'error';
        job.error = error.message || 'Could not generate read aloud audio';
        fs.rmSync(wavPath, { force: true });
        throw error;
    }
};

export const prefetchReadAloudAudioAwait = async (email, settings, summaryText = '') => {
    if (!hasSummaryProviderConfigured(settings) || !summaryText) {
        throw new Error('Summary text is required before generating read aloud audio.');
    }

    ensureStorageDir();
    const cacheKey = getCacheKey(email, settings);
    const cached = getCachedJob(cacheKey);
    if (cached) {
        jobs.set(cacheKey, cached);
        return getJobSnapshot(cached);
    }

    const existing = jobs.get(cacheKey);
    if (existing?.status === 'ready') {
        return getJobSnapshot(existing);
    }

    const job = createJob(cacheKey);
    jobs.set(cacheKey, job);
    return processJob(job, email, settings, summaryText);
};

export const prefetchReadAloudAudio = (email, settings, summaryText = '') => {
    if (!hasSummaryProviderConfigured(settings) || !summaryText) {
        return null;
    }

    ensureStorageDir();
    const cacheKey = getCacheKey(email, settings);
    const cached = getCachedJob(cacheKey);
    if (cached) {
        jobs.set(cacheKey, cached);
        return getJobSnapshot(cached);
    }

    const existing = jobs.get(cacheKey);
    if (existing && existing.status !== 'error') {
        return getJobSnapshot(existing);
    }

    const job = createJob(cacheKey);
    jobs.set(cacheKey, job);
    processJob(job, email, settings, summaryText).catch(() => {});
    return getJobSnapshot(job);
};

export const canReadAloud = async () => {
    const settings = await getSettings();
    return hasSummaryProviderConfigured(settings);
};

export const startReadAloudJob = async (email) => {
    ensureStorageDir();
    const settings = await getSettings();

    if (!hasSummaryProviderConfigured(settings)) {
        throw new Error('Save a summary provider API key before using read aloud.');
    }

    const cacheKey = getCacheKey(email, settings);
    const cached = getCachedJob(cacheKey);
    if (cached) {
        jobs.set(cacheKey, cached);
        return getJobSnapshot(cached);
    }

    const existing = jobs.get(cacheKey);
    if (existing) {
        return getJobSnapshot(existing);
    }

    const storedSummary = getStoredEmailSummary(email);
    const job = createJob(cacheKey);
    if (storedSummary) {
        job.summary = storedSummary;
    }

    jobs.set(cacheKey, job);
    processJob(job, email, settings, storedSummary).catch(() => {});
    return getJobSnapshot(job);
};

export const getReadAloudJob = (jobId) => {
    ensureStorageDir();
    const id = String(jobId || '');
    const job = jobs.get(id) || getCachedJob(id);
    if (!job) {
        return null;
    }
    jobs.set(id, job);
    return getJobSnapshot(job);
};

export const getReadAloudAudioPath = (filename) => {
    const safeName = path.basename(String(filename || ''));
    if (!/^[a-f0-9]{32}\.ogg$/.test(safeName)) {
        return null;
    }
    const filePath = path.join(STORAGE_DIR, safeName);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return filePath;
};

export const cleanupReadAloudAudio = () => {
    ensureStorageDir();
    const now = Date.now();
    for (const file of fs.readdirSync(STORAGE_DIR)) {
        const filePath = path.join(STORAGE_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > CACHE_TTL_MS) {
            fs.rmSync(filePath, { force: true });
        }
    }

    for (const [jobId, job] of jobs.entries()) {
        if (job.status === 'ready' && !fs.existsSync(path.join(STORAGE_DIR, job.filename))) {
            jobs.delete(jobId);
        }
    }
};

export const startReadAloudCleanup = () => {
    cleanupReadAloudAudio();
    if (!cleanupTimer) {
        cleanupTimer = setInterval(cleanupReadAloudAudio, 30 * 60 * 1000);
        cleanupTimer.unref?.();
    }
};
