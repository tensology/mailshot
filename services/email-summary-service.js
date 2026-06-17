import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';
import { hasSummaryProviderConfigured, summarizeEmailWithSettings } from './ai-provider.js';
import { getSettings } from './settings-store.js';
import {
    getCachedEmails,
    saveMailboxCacheToDisk,
    updateCachedEmail
} from './mail-sync.js';

const SUMMARY_QUEUE = [];
const QUEUED_IDS = new Set();
const PROCESSING_IDS = new Set();
let pumpScheduled = false;

const stripHtml = (value = '') => String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

const truncate = (value = '', limit = 8000) => {
    const text = String(value || '');
    return text.length > limit ? `${text.slice(0, limit)}\n\n[Email truncated for summarization.]` : text;
};

export const buildSummaryPrompt = (email = {}) => {
    const from = email.from || 'Unknown sender';
    const to = email.to || '';
    const subject = email.subject || '(no subject)';
    const body = truncate(stripHtml(email.body || email.body_html || ''));

    return [
        'Summarize this email for audio playback in 2 to 4 short sentences.',
        'Start with "This email is about..." or equivalent natural phrasing.',
        'Mention the sender, the core point, and any action/date/deadline if present.',
        '',
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
    ].join('\n');
};

export const shouldPrefetchEmailSummary = (email = {}) => (
    email.type === 'inbox'
    && !email.bin
    && !email.spam
    && email.read_summary_status !== 'ready'
    && email.read_summary_status !== 'processing'
);

export const canPrefetchEmailSummary = async () => {
    const settings = await getSettings();
    return hasSummaryProviderConfigured(settings);
};

const getEmailId = (email = {}) => String(email._id || email.messageId || '');

const persistSummary = async (email, summary, status, error = '') => {
    const updates = {
        read_summary: summary || '',
        read_summary_status: status,
        read_summary_at: status === 'ready' ? new Date() : email.read_summary_at
    };

    if (isDbConnected() && email._id && !String(email._id).startsWith('cache-') && !String(email._id).startsWith('sent-')) {
        await Email.updateOne({ _id: email._id }, { $set: updates });
        return { ...email, ...updates };
    }

    if (email._id) {
        const cached = updateCachedEmail(email._id, updates);
        saveMailboxCacheToDisk();
        return cached || { ...email, ...updates };
    }

    return { ...email, ...updates };
};

const processSummaryJob = async (email) => {
    const emailId = getEmailId(email);
    if (!emailId) {
        return;
    }

    PROCESSING_IDS.add(emailId);

    try {
        const settings = await getSettings();
        if (!hasSummaryProviderConfigured(settings)) {
            return;
        }

        await persistSummary(email, email.read_summary || '', 'processing');

        const summary = await summarizeEmailWithSettings({
            settings,
            prompt: buildSummaryPrompt(email)
        });

        const saved = await persistSummary(email, summary, 'ready');
        const prefetchAudio = String(process.env.MAILSHOT_PREFETCH_READ_AUDIO ?? 'true') !== 'false';
        if (prefetchAudio) {
            const { prefetchReadAloudAudio } = await import('./read-aloud-service.js');
            prefetchReadAloudAudio(saved, settings, summary);
        }
    } catch (error) {
        await persistSummary(email, '', 'error');
        console.error(`Email summary failed for ${emailId}:`, error.message || error);
    } finally {
        PROCESSING_IDS.delete(emailId);
        QUEUED_IDS.delete(emailId);
    }
};

const schedulePump = () => {
    if (pumpScheduled) {
        return;
    }

    pumpScheduled = true;
    setImmediate(async () => {
        pumpScheduled = false;

        while (SUMMARY_QUEUE.length > 0) {
            const email = SUMMARY_QUEUE.shift();
            const emailId = getEmailId(email);
            if (!emailId || PROCESSING_IDS.has(emailId)) {
                continue;
            }

            await processSummaryJob(email);
        }
    });
};

export const enqueueEmailSummary = (email) => {
    if (!email || !shouldPrefetchEmailSummary(email)) {
        return;
    }

    const emailId = getEmailId(email);
    if (!emailId || QUEUED_IDS.has(emailId) || PROCESSING_IDS.has(emailId)) {
        return;
    }

    QUEUED_IDS.add(emailId);
    SUMMARY_QUEUE.push(email);
    schedulePump();
};

const loadBackfillCandidates = async (limit = 40) => {
    if (!(await canPrefetchEmailSummary())) {
        return [];
    }

    if (isDbConnected()) {
        return Email.find({
            type: 'inbox',
            bin: false,
            spam: false,
            read_summary_status: { $nin: ['ready', 'processing'] }
        })
            .sort({ date: -1 })
            .limit(limit)
            .lean();
    }

    return getCachedEmails({ type: 'inbox' })
        .filter((email) => shouldPrefetchEmailSummary(email))
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .slice(0, limit);
};

export const startEmailSummaryWorker = async () => {
    if (!(await canPrefetchEmailSummary())) {
        return;
    }

    const candidates = await loadBackfillCandidates();
    candidates.forEach((email) => enqueueEmailSummary(email));

    if (candidates.length > 0) {
        console.log(`Queued ${candidates.length} email summaries for background generation`);
    }
};

export const getStoredEmailSummary = (email = {}) => {
    if (email.read_summary_status === 'ready' && String(email.read_summary || '').trim()) {
        return String(email.read_summary).trim();
    }

    return '';
};
