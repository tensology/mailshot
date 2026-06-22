import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';
import { parseMailAttachments } from './attachments.js';
import { slugify } from '../utils/slug.js';
import { sendMail } from './mailer.js';
import { findSettingsForEmail, getSettings, markAutoresponderSent } from './settings-store.js';
import { findEmailsBySubject, mergeThreadEmails } from '../utils/thread-subject.js';
import { findLabelRuleForEmail } from './label-rule-store.js';
import { enqueueEmailSummary } from './email-summary-service.js';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'mailbox-cache.json');

const buildStableId = (prefix, messageId) => {
    if (!messageId) {
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    const digest = crypto.createHash('sha1').update(`${prefix}:${messageId}`).digest('hex').slice(0, 20);
    return `${prefix}-${digest}`;
};

const buildStableCacheId = (messageId) => buildStableId('cache', messageId);

export const buildStableSentId = (messageId) => buildStableId('sent', messageId);

export const isCachedEmailId = (id) => {
    const value = String(id || '');
    return value.startsWith('cache-') || value.startsWith('sent-');
};

const createAddressString = (addressObject = {}) => {
    if (!addressObject) return '';
    const source = addressObject.text;
    if (source) return source;
    if (Array.isArray(addressObject.value) && addressObject.value.length > 0) {
        const first = addressObject.value[0];
        return first?.address || '';
    }
    return '';
};

const decodeHtmlEntities = (value = '') => {
    return String(value)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
};

const stripHtml = (value = '') => decodeHtmlEntities(
    String(value)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
).trim();

const applyLabelRule = async (payload = {}) => {
    if (payload.type !== 'inbox') {
        return {
            labels: [],
            in_inbox: true
        };
    }

    const rule = await findLabelRuleForEmail(payload.from);
    if (!rule) {
        return {
            labels: [],
            in_inbox: true
        };
    }

    return {
        labels: [rule.label],
        in_inbox: false
    };
};

const getSyncConfig = () => ({
    host: process.env.MAIL_IMAP_HOST,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: {
        user: process.env.MAILBOX_USER || process.env.MAIL_USERNAME || process.env.MAIL_IMAP_USERNAME,
        pass: process.env.MAILBOX_PASSWORD || process.env.MAIL_PASSWORD || process.env.MAIL_IMAP_PASSWORD
    }
});

let syncInterval;
const mailboxCache = [];
const suppressedMessageIds = new Set();

/**
 * Load persisted mailbox cache from disk (used when MongoDB is unavailable).
 */
export const loadMailboxCacheFromDisk = () => {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return 0;
        }

        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.emails)) {
            return 0;
        }

        mailboxCache.length = 0;
        for (const item of parsed.emails) {
            mailboxCache.push({
                ...item,
                date: new Date(item.date || Date.now())
            });
        }

        if (Array.isArray(parsed.suppressed_message_ids)) {
            parsed.suppressed_message_ids.forEach((id) => suppressedMessageIds.add(String(id)));
        }

        return mailboxCache.length;
    } catch (error) {
        console.error('Failed to load mailbox cache from disk:', error.message);
        return 0;
    }
};

/**
 * Persist mailbox cache to disk so imports and state survive restarts.
 */
export const saveMailboxCacheToDisk = () => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            saved_at: new Date().toISOString(),
            emails: mailboxCache,
            suppressed_message_ids: [...suppressedMessageIds]
        }));
        return mailboxCache.length;
    } catch (error) {
        console.error('Failed to save mailbox cache to disk:', error.message);
        return 0;
    }
};

export const suppressMessageId = (messageId) => {
    if (messageId) {
        suppressedMessageIds.add(String(messageId));
    }
};

export const isMessageSuppressed = (messageId) => {
    return messageId ? suppressedMessageIds.has(String(messageId)) : false;
};

const parseNameFromAddress = (value = '') => {
    const match = /^"?([^<>"]+)"?\s*<[^>]+>$/.exec(value || '');
    return match ? match[1].trim() : (value || '').split('@')[0] || 'Unknown';
};

const normalizeAddress = (value = '') => {
    const plain = String(value || '').trim().toLowerCase();
    const bracketMatch = /<([^>]+)>/.exec(plain);
    return (bracketMatch ? bracketMatch[1] : plain).trim();
};

const getMailboxIdentityAddresses = () => {
    const candidates = [
        process.env.MAILBOX_USER,
        process.env.MAIL_USERNAME,
        process.env.MAIL_FROM
    ];

    return [...new Set(candidates.filter(Boolean).map((value) => normalizeAddress(value)))];
};

const mailboxIdentity = getMailboxIdentityAddresses();

const isMailboxSender = (address = '') => {
    const normalized = normalizeAddress(address);
    return normalized && mailboxIdentity.includes(normalized);
};

const isNoReplyAddress = (address = '') => {
    const normalized = normalizeAddress(address);
    return /(^|[._-])(no-?reply|do-?not-?reply|donotreply)([._-]|@)/i.test(normalized);
};

const shouldAutoRespond = async (payload = {}) => {
    if (!payload.messageId || payload.type !== 'inbox' || isMailboxSender(payload.from) || isNoReplyAddress(payload.from)) {
        return { ok: false };
    }

    const settings = await getSettings();
    const log = Array.isArray(settings.autoresponder_log) ? settings.autoresponder_log : [];
    const threadKey = payload.references?.[0] || payload.in_reply_to || payload.messageId;
    const { autoresponder } = findSettingsForEmail(settings.general, payload.to);
    if (!autoresponder?.enabled || !autoresponder?.html || log.includes(threadKey)) {
        return { ok: false };
    }

    return { ok: true, autoresponder, threadKey };
};

const sendAutoResponderIfNeeded = async (payload = {}) => {
    const decision = await shouldAutoRespond(payload);
    if (!decision.ok) {
        return;
    }

    const html = decision.autoresponder.html;
    const subjectTemplate = decision.autoresponder.subject || 'Re: {{subject}}';
    const subject = subjectTemplate.replace(/\{\{\s*subject\s*\}\}/gi, payload.subject || '(no subject)');

    try {
        await sendMail({
            to: payload.from,
            subject,
            body: stripHtml(html),
            html,
            inReplyTo: payload.messageId,
            references: [payload.messageId, ...(payload.references || [])].filter(Boolean)
        });
        await markAutoresponderSent(decision.threadKey);
    } catch (error) {
        console.error('Auto responder failed:', error.message);
    }
};

const persistCachedEmail = (payload = {}) => {
    const existingIndex = payload._id
        ? mailboxCache.findIndex(item => item._id === payload._id)
        : mailboxCache.findIndex(item => item.messageId && item.messageId === payload.messageId);

    const existing = existingIndex >= 0 ? mailboxCache[existingIndex] : null;

    if (existingIndex >= 0) {
        const current = mailboxCache[existingIndex];
        const merged = {
            ...current,
            ...payload,
            _id: current._id,
            read: Boolean(current.read || payload.read),
            starred: current.starred,
            bin: current.bin,
            archived: current.archived,
            spam: current.spam,
            labels: current.labels?.length ? current.labels : (payload.labels || []),
            date: new Date(payload.date || current.date || Date.now())
        };
        mailboxCache[existingIndex] = merged;
        return merged;
    }

    const normalized = {
        read: false,
        labels: [],
        attachments: [],
        archived: false,
        spam: false,
        body_html: '',
        in_reply_to: '',
        references: [],
        starred: false,
        bin: false,
        ...payload,
        _id: payload._id || buildStableCacheId(payload.messageId),
        date: new Date(payload.date || Date.now())
    };

    mailboxCache.push(normalized);
    return normalized;
};

const matchesFilter = (item, filter = {}) => {
    if (filter.bin !== undefined && filter.bin !== item.bin) return false;
    if (filter.archived !== undefined && filter.archived !== item.archived) return false;
    if (filter.spam !== undefined && filter.spam !== Boolean(item.spam)) return false;
    if (filter.starred !== undefined && filter.starred !== item.starred) return false;
    if (filter.read !== undefined && filter.read !== Boolean(item.read)) return false;
    if (filter.type && filter.type !== item.type) return false;
    if (filter.in_inbox === true && item.in_inbox === false) return false;
    if (filter.label) {
        const wanted = String(filter.label);
        const hasLabel = (item.labels || []).some((label) => (
            label === wanted || slugify(label) === wanted
        ));
        if (!hasLabel) return false;
    }
    if (filter.search) {
        const haystack = [item.subject, item.body, item.from, item.to].join(' ').toLowerCase();
        if (!haystack.includes(filter.search.toLowerCase())) return false;
    }
    if (filter.participant) {
        const wanted = String(filter.participant).toLowerCase();
        const haystack = [item.from, item.to, item.cc].join(' ').toLowerCase();
        if (!haystack.includes(wanted)) return false;
    }
    return true;
};

export const getCachedEmails = (filter = {}) => {
    return mailboxCache
        .filter((item) => matchesFilter(item, filter))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const getCachedEmailById = (id) => {
    return mailboxCache.find((item) => item._id === id) || null;
};

export const findEmailRecord = async (id) => {
    const cached = getCachedEmailById(id);
    if (cached) {
        return { email: cached, source: 'cache' };
    }

    if (!isDbConnected() || isCachedEmailId(id)) {
        return null;
    }

    if (!/^[a-f\d]{24}$/i.test(String(id))) {
        return null;
    }

    try {
        const doc = await Email.findById(id);
        if (doc) {
            return { email: doc, source: 'db' };
        }
    } catch (error) {
        return null;
    }

    return null;
};

export const updateCachedEmail = (id, updates = {}) => {
    const index = mailboxCache.findIndex((item) => item._id === id);
    if (index < 0) return null;
    mailboxCache[index] = { ...mailboxCache[index], ...updates };
    return mailboxCache[index];
};

export const deleteCachedEmails = (ids = []) => {
    const idSet = new Set(ids);
    for (let i = mailboxCache.length - 1; i >= 0; i -= 1) {
        if (idSet.has(mailboxCache[i]._id)) {
            if (mailboxCache[i].messageId) {
                suppressMessageId(mailboxCache[i].messageId);
            }
            mailboxCache.splice(i, 1);
        }
    }
};

export const buildEmailFilter = (type, query = {}) => {
    const unreadFilter = String(query.unread || '') === 'true' ? { read: false } : {};
    const searchFilter = query.search ? { search: String(query.search).trim() } : {};
    const participantFilter = query.participant ? { participant: String(query.participant).trim() } : {};

    if (type === 'starred') {
        return { starred: true, bin: false, archived: false, spam: false, ...unreadFilter, ...searchFilter, ...participantFilter };
    }
    if (type === 'bin') {
        return { bin: true, ...unreadFilter, ...searchFilter, ...participantFilter };
    }
    if (type === 'spam') {
        return { spam: true, bin: false, ...unreadFilter, ...searchFilter, ...participantFilter };
    }
    if (type === 'archived') {
        return { archived: true, bin: false, spam: false, ...unreadFilter, ...searchFilter, ...participantFilter };
    }
    if (type === 'allmail') {
        const filter = { bin: false, spam: false, ...unreadFilter, ...searchFilter, ...participantFilter };
        if (query.label) {
            filter.label = query.label;
        }
        return filter;
    }
    if (type === 'inbox') {
        return {
            type: 'inbox',
            bin: false,
            archived: false,
            spam: false,
            in_inbox: true,
            ...unreadFilter,
            ...searchFilter,
            ...participantFilter,
            ...(query.label ? { label: query.label } : {}),
        };
    }
    return {
        type,
        spam: false,
        ...unreadFilter,
        ...searchFilter,
        ...participantFilter,
        ...(query.label ? { label: query.label } : {}),
    };
};

const SYNC_RECENT_UID_WINDOW = Number(process.env.MAILBOX_SYNC_UID_WINDOW || 200);

const buildFetchUidSet = (mailboxStatus = {}) => {
    const uidNext = Number(mailboxStatus.uidNext || 1);
    const startUid = Math.max(1, uidNext - SYNC_RECENT_UID_WINDOW);
    return `${startUid}:*`;
};

const formatSyncError = (error) => {
    const response = String(error?.response || '');
    if (response.includes('AUTHENTICATIONFAILED') || response.includes('Authentication failed')) {
        return 'IMAP authentication failed. Update MAILBOX_PASSWORD in server .env with your mailbox password.';
    }
    if (error?.message) {
        return error.message;
    }
    return 'Mailbox sync failed';
};

const createImapClient = (config) => new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    tls: {
        rejectUnauthorized: false
    },
    logger: false
});

const RETRYABLE_IMAP_CONNECTION_CODES = new Set([
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ECONNABORTED',
    'ENETUNREACH',
    'ENETDOWN',
    'EHOSTDOWN',
    'EPIPE'
]);

const RETRYABLE_IMAP_CONNECTION_MESSAGES = [
    /client network socket disconnected/i,
    /socket (?:closed|hang up)/i,
    /connection (?:closed|reset|terminated|timed out)/i,
    /\b(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH)\b/i
];

const isImapAuthFailure = (error) => {
    const response = String(error?.response || '');
    const message = String(error?.message || '');
    return response.includes('AUTHENTICATIONFAILED')
        || response.includes('Authentication failed')
        || message.includes('AUTHENTICATIONFAILED')
        || message.includes('Authentication failed');
};

export const shouldRetryImapOnLocalhost = (error, host, fallbackHost) => {
    if (host === fallbackHost) {
        return false;
    }
    if (isImapAuthFailure(error)) {
        return false;
    }

    const code = String(error?.code || '').toUpperCase();
    if (RETRYABLE_IMAP_CONNECTION_CODES.has(code)) {
        return true;
    }

    const message = String(error?.message || error?.response || '');
    return RETRYABLE_IMAP_CONNECTION_MESSAGES.some((pattern) => pattern.test(message));
};

const connectImapClient = async (config) => {
    const fallbackHost = process.env.MAIL_IMAP_FALLBACK_HOST || '127.0.0.1';
    const client = createImapClient(config);

    try {
        await client.connect();
        return client;
    } catch (error) {
        try {
            await client.logout();
        } catch (ignored) {}

        if (!shouldRetryImapOnLocalhost(error, config.host, fallbackHost)) {
            throw error;
        }

        const fallbackClient = createImapClient({ ...config, host: fallbackHost });
        await fallbackClient.connect();
        return fallbackClient;
    }
};

const syncOnce = async () => {
    const config = getSyncConfig();
    if (!config.host || !config.auth.user || !config.auth.pass) {
        return { synced: 0, skipped: 0, error: 'IMAP settings are not configured (MAIL_IMAP_HOST, MAILBOX_USER, MAILBOX_PASSWORD)' };
    }

    let synced = 0;
    let skipped = 0;
    let client;

    try {
        client = await connectImapClient(config);
        const mailbox = 'INBOX';
        const lock = await client.getMailboxLock(mailbox);
        try {
            const mailboxStatus = await client.status(mailbox, { uidNext: true, messages: true, unseen: true });
            const fetchSet = buildFetchUidSet(mailboxStatus);

            for await (const msg of client.fetch(fetchSet, { uid: true, source: true, envelope: true, internalDate: true, flags: true })) {
                try {
                    const parsed = await simpleParser(msg.source);
                    const fromValue = createAddressString(parsed.from);
                    const toValue = createAddressString(parsed.to);
                    const subject = parsed.subject || msg.envelope?.subject || '';
                    const messageId = parsed.messageId || `${msg.uid}-${mailbox}`;
                    const emailType = isMailboxSender(fromValue) ? 'sent' : 'inbox';
                    const attachments = parseMailAttachments(parsed.attachments || []);

                    const ccValue = createAddressString(parsed.cc);

                    if (isMessageSuppressed(messageId)) {
                        skipped++;
                        continue;
                    }

                    const payload = {
                        to: toValue,
                        cc: ccValue,
                        from: fromValue,
                        subject: decodeHtmlEntities(subject),
                        body: parsed.text || stripHtml(parsed.html || ''),
                        body_html: typeof parsed.html === 'string' ? parsed.html : '',
                        date: msg.internalDate || parsed.date || new Date(),
                        image: '',
                        name: parseNameFromAddress(fromValue),
                        read: Boolean(msg.flags?.has('\\Seen')),
                        type: emailType,
                        messageId,
                        in_reply_to: parsed.inReplyTo || '',
                        references: Array.isArray(parsed.references) ? parsed.references : [],
                        attachments
                    };

                    if (isDbConnected()) {
                        const existing = await Email.findOne({ messageId: payload.messageId });
                        if (existing) {
                            if (existing.bin) {
                                skipped++;
                                continue;
                            }
                            await Email.updateOne(
                                { _id: existing._id },
                                {
                                    $set: {
                                        body: payload.body,
                                        body_html: payload.body_html,
                                        subject: payload.subject,
                                        read: Boolean(existing.read || payload.read)
                                    }
                                }
                            );
                            skipped++;
                            continue;
                        }

                        const labelState = await applyLabelRule(payload);
                        const emailDoc = await Email.create({
                            ...payload,
                            starred: false,
                            bin: false,
                            archived: false,
                            spam: false,
                            in_inbox: labelState.in_inbox,
                            labels: labelState.labels
                        });
                        if (!emailDoc) {
                            skipped++;
                        } else {
                            synced++;
                            await sendAutoResponderIfNeeded(payload);
                            enqueueEmailSummary(emailDoc.toObject ? emailDoc.toObject() : emailDoc);
                        }
                    } else {
                        const existing = mailboxCache.find((item) => item.messageId === messageId);
                        if (existing) {
                            persistCachedEmail(payload);
                            skipped++;
                        } else {
                            const labelState = await applyLabelRule(payload);
                            const cachedEmail = persistCachedEmail({
                                ...payload,
                                starred: false,
                                bin: false,
                                archived: false,
                                spam: false,
                                in_inbox: labelState.in_inbox,
                                labels: labelState.labels
                            });
                            synced++;
                            await sendAutoResponderIfNeeded(payload);
                            enqueueEmailSummary(cachedEmail);
                        }
                    }
                } catch (error) {
                    skipped++;
                    const errorMessage = error?.message || 'Error parsing/saving IMAP message';
                    console.error('Error parsing/saving IMAP message:', errorMessage);
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return {
            synced,
            skipped,
            mailbox: mailbox,
            uid_window: SYNC_RECENT_UID_WINDOW,
            synced_at: new Date().toISOString()
        };
    } catch (error) {
        try {
            if (client) {
                await client.logout();
            }
        } catch (ignored) {}

        const message = formatSyncError(error);
        console.error('Mailbox sync failed:', message, error?.response || '');

        return {
            synced,
            skipped,
            error: message,
            code: error?.code,
            command: error?.command,
            response: error?.response
        };
    }
};

export const upsertCachedEmail = (mail) => {
    if (!mail) return null;

    const payload = {
        ...mail,
        date: new Date(mail.date || Date.now())
    };

    return persistCachedEmail(payload);
};

export const startMailboxSync = (options = {}) => {
    const intervalMs = Number(options.intervalMs || 60000);
    const enabled = String(options.enabled ?? 'true') === 'true';

    if (!enabled) {
        return;
    }

    const loaded = loadMailboxCacheFromDisk();
    if (loaded > 0) {
        console.log(`Loaded ${loaded} emails from disk cache`);
    }

    syncOnce().catch(err => console.error('Mail sync failed:', err.message));
    syncInterval = setInterval(() => {
        syncOnce().catch(err => console.error('Mail sync failed:', err.message));
    }, intervalMs);
};

export const syncMailboxNow = async () => syncOnce();

export const getThreadForEmail = (anchorEmail) => {
    if (!anchorEmail) {
        return [];
    }

    const allEmails = [...mailboxCache];
    const relatedIds = new Set(
        [anchorEmail.messageId, anchorEmail.in_reply_to, ...(anchorEmail.references || [])].filter(Boolean)
    );

    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const item of allEmails) {
            if (!item.messageId || relatedIds.has(item.messageId)) {
                continue;
            }

            const references = item.references || [];
            const matchesThread = relatedIds.has(item.in_reply_to)
                || references.some((ref) => relatedIds.has(ref));

            if (matchesThread) {
                relatedIds.add(item.messageId);
                references.forEach((ref) => relatedIds.add(ref));
                expanded = true;
            }
        }
    }

    const idThread = allEmails
        .filter((item) => item.messageId && relatedIds.has(item.messageId))
        .sort((left, right) => new Date(left.date) - new Date(right.date));

    const subjectThread = findEmailsBySubject(allEmails, anchorEmail);

    return mergeThreadEmails(anchorEmail, idThread, subjectThread);
};
