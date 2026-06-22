import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';
import { hasSummaryProviderConfigured, summarizeEmailWithSettings } from './ai-provider.js';
import { getSettings } from './settings-store.js';
import {
    getCachedEmails,
    saveMailboxCacheToDisk,
    updateCachedEmail
} from './mail-sync.js';
import { getMailboxRepository, isMailboxStoreReady } from './postgres-mailbox-store.js';

const SUMMARY_QUEUE = [];
const QUEUED_IDS = new Set();
const PROCESSING_IDS = new Set();
let pumpScheduled = false;

let bulkProgress = {
    active: false,
    total: 0,
    processed: 0,
    failed: 0,
    started_at: null,
    finished_at: null
};

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

export const needsReadAloudPipeline = (email = {}) => (
    email.type === 'inbox'
    && !email.bin
    && !email.spam
    && email.read_aloud_status !== 'ready'
    && email.read_aloud_status !== 'processing'
);

export const shouldPrefetchEmailSummary = needsReadAloudPipeline;

export const canPrefetchEmailSummary = async () => {
    const settings = await getSettings();
    return hasSummaryProviderConfigured(settings);
};

const getEmailId = (email = {}) => String(email._id || email.messageId || '');

const persistEmailReadAloudFields = async (email, updates = {}) => {
    if (isMailboxStoreReady() && email._id) {
        const repository = getMailboxRepository();
        await repository.updateMany([email._id], updates);
        return { ...email, ...updates };
    }

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

const markBulkItemFinished = (failed = false) => {
    if (!bulkProgress.active) {
        return;
    }

    bulkProgress.processed += 1;
    if (failed) {
        bulkProgress.failed += 1;
    }

    if (bulkProgress.processed >= bulkProgress.total) {
        bulkProgress.active = false;
        bulkProgress.finished_at = new Date().toISOString();
    }
};

const processReadAloudPipeline = async (email) => {
    const emailId = getEmailId(email);
    if (!emailId) {
        return;
    }

    PROCESSING_IDS.add(emailId);
    let failed = false;

    try {
        const settings = await getSettings();
        if (!hasSummaryProviderConfigured(settings)) {
            return;
        }

        let current = await persistEmailReadAloudFields(email, {
            read_summary_status: 'processing',
            read_aloud_status: 'processing'
        });

        let summary = getStoredEmailSummary(current);
        if (!summary) {
            summary = await summarizeEmailWithSettings({
                settings,
                prompt: buildSummaryPrompt(current)
            });
            current = await persistEmailReadAloudFields(current, {
                read_summary: summary,
                read_summary_status: 'ready',
                read_summary_at: new Date()
            });
        }

        const { prefetchReadAloudAudioAwait } = await import('./read-aloud-service.js');
        await prefetchReadAloudAudioAwait(current, settings, summary);

        await persistEmailReadAloudFields(current, {
            read_summary: summary,
            read_summary_status: 'ready',
            read_aloud_status: 'ready',
            read_summary_at: current.read_summary_at || new Date()
        });
    } catch (error) {
        failed = true;
        await persistEmailReadAloudFields(email, {
            read_summary_status: 'error',
            read_aloud_status: 'error'
        });
        console.error(`Read aloud pipeline failed for ${emailId}:`, error.message || error);
    } finally {
        PROCESSING_IDS.delete(emailId);
        QUEUED_IDS.delete(emailId);
        markBulkItemFinished(failed);
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

            await processReadAloudPipeline(email);
        }
    });
};

export const enqueueEmailSummary = (email) => {
    if (!email || !needsReadAloudPipeline(email)) {
        return false;
    }

    const emailId = getEmailId(email);
    if (!emailId || QUEUED_IDS.has(emailId) || PROCESSING_IDS.has(emailId)) {
        return false;
    }

    QUEUED_IDS.add(emailId);
    SUMMARY_QUEUE.push(email);
    schedulePump();
    return true;
};

const loadReadAloudCandidates = async ({ limit = 0 } = {}) => {
    if (!(await canPrefetchEmailSummary())) {
        return [];
    }

    if (isMailboxStoreReady()) {
        const repository = getMailboxRepository();
        const candidates = (await repository.list({
            type: 'inbox',
            bin: false,
            spam: false
        }))
            .filter((email) => needsReadAloudPipeline(email));

        return limit > 0 ? candidates.slice(0, limit) : candidates;
    }

    if (isDbConnected()) {
        let query = Email.find({
            type: 'inbox',
            bin: false,
            spam: false,
            read_aloud_status: { $nin: ['ready', 'processing'] }
        })
            .sort({ date: -1 });

        if (limit > 0) {
            query = query.limit(limit);
        }

        return query.lean();
    }

    const candidates = getCachedEmails({ type: 'inbox' })
        .filter((email) => needsReadAloudPipeline(email))
        .sort((left, right) => new Date(right.date) - new Date(left.date));

    return limit > 0 ? candidates.slice(0, limit) : candidates;
};

export const getBulkReadAloudStatus = () => ({
    active: bulkProgress.active,
    total: bulkProgress.total,
    processed: bulkProgress.processed,
    failed: bulkProgress.failed,
    queued: SUMMARY_QUEUE.length + PROCESSING_IDS.size,
    started_at: bulkProgress.started_at,
    finished_at: bulkProgress.finished_at
});

export const startBulkReadAloudSummaries = async () => {
    if (!(await canPrefetchEmailSummary())) {
        throw new Error('Save a summary provider API key before summarizing mail.');
    }

    if (bulkProgress.active) {
        return getBulkReadAloudStatus();
    }

    const candidates = await loadReadAloudCandidates();
    let queued = 0;

    bulkProgress = {
        active: false,
        total: 0,
        processed: 0,
        failed: 0,
        started_at: new Date().toISOString(),
        finished_at: null
    };

    for (const email of candidates) {
        if (enqueueEmailSummary(email)) {
            queued += 1;
        }
    }

    bulkProgress.total = queued;
    bulkProgress.active = queued > 0;

    if (queued === 0) {
        bulkProgress.finished_at = new Date().toISOString();
    }

    return {
        ...getBulkReadAloudStatus(),
        queued
    };
};

export const startEmailSummaryWorker = async () => {
    if (!(await canPrefetchEmailSummary())) {
        return;
    }

    const candidates = await loadReadAloudCandidates({ limit: 40 });
    let queued = 0;
    candidates.forEach((email) => {
        if (enqueueEmailSummary(email)) {
            queued += 1;
        }
    });

    if (queued > 0) {
        console.log(`Queued ${queued} email summaries for background generation`);
    }
};

export const getStoredEmailSummary = (email = {}) => {
    const summary = String(email.read_summary || '').trim();
    if (!summary) {
        return '';
    }

    if (email.read_summary_status === 'ready' || email.read_aloud_status === 'ready') {
        return summary;
    }

    return '';
};

export const isReadAloudReady = (email = {}) => email.read_aloud_status === 'ready';
