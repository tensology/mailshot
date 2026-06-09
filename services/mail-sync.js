import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';
import { parseMailAttachments } from './attachments.js';

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

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, '\n').replace(/\n{2,}/g, '\n').trim();

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

const persistCachedEmail = (payload = {}) => {
    const existingIndex = payload._id
        ? mailboxCache.findIndex(item => item._id === payload._id)
        : mailboxCache.findIndex(item => item.messageId && item.messageId === payload.messageId);

    const existing = existingIndex >= 0 ? mailboxCache[existingIndex] : null;

    const normalized = {
        read: false,
        labels: [],
        attachments: [],
        archived: false,
        body_html: '',
        in_reply_to: '',
        references: [],
        ...payload,
        _id: payload._id || existing?._id || buildStableCacheId(payload.messageId),
        date: new Date(payload.date || Date.now())
    };

    if (existingIndex >= 0) {
        mailboxCache[existingIndex] = { ...mailboxCache[existingIndex], ...normalized };
        return mailboxCache[existingIndex];
    }

    mailboxCache.push(normalized);
    return normalized;
};

const matchesFilter = (item, filter = {}) => {
    if (filter.bin !== undefined && filter.bin !== item.bin) return false;
    if (filter.archived !== undefined && filter.archived !== item.archived) return false;
    if (filter.starred !== undefined && filter.starred !== item.starred) return false;
    if (filter.type && filter.type !== item.type) return false;
    if (filter.label && !(item.labels || []).includes(filter.label)) return false;
    if (filter.search) {
        const haystack = [item.subject, item.body, item.from, item.to].join(' ').toLowerCase();
        if (!haystack.includes(filter.search.toLowerCase())) return false;
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
            mailboxCache.splice(i, 1);
        }
    }
};

export const buildEmailFilter = (type, query = {}) => {
    if (type === 'starred') {
        return { starred: true, bin: false, archived: false };
    }
    if (type === 'bin') {
        return { bin: true };
    }
    if (type === 'archived') {
        return { archived: true, bin: false };
    }
    if (type === 'allmail') {
        return query.label ? { label: query.label } : {};
    }
    if (type === 'inbox') {
        return { type: 'inbox', bin: false, archived: false, ...(query.label ? { label: query.label } : {}) };
    }
    return { type, ...(query.label ? { label: query.label } : {}) };
};

const syncOnce = async () => {
    const config = getSyncConfig();
    if (!config.host || !config.auth.user || !config.auth.pass) {
        return { synced: 0, skipped: 0, error: 'IMAP settings are not configured' };
    }

    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
        tls: {
            rejectUnauthorized: false
        },
        logger: false
    });

    let synced = 0;
    let skipped = 0;

    try {
        await client.connect();
        const mailbox = 'INBOX';
        const lock = await client.getMailboxLock(mailbox);
        try {
            const unseen = await client.search({ seen: false });
            const fetchSet = (unseen && unseen.length > 0) ? unseen.join(',') : '1:*';

            for await (const msg of client.fetch(fetchSet, { uid: true, source: true, envelope: true, internalDate: true })) {
                try {
                    const parsed = await simpleParser(msg.source);
                    const fromValue = createAddressString(parsed.from);
                    const toValue = createAddressString(parsed.to);
                    const subject = parsed.subject || msg.envelope?.subject || '';
                    const messageId = parsed.messageId || `${msg.uid}-${mailbox}`;
                    const emailType = isMailboxSender(fromValue) ? 'sent' : 'inbox';
                    const attachments = parseMailAttachments(parsed.attachments || []);

                    const payload = {
                        to: toValue,
                        from: fromValue,
                        subject,
                        body: parsed.text || stripHtml(parsed.html || ''),
                        body_html: typeof parsed.html === 'string' ? parsed.html : '',
                        date: msg.internalDate || parsed.date || new Date(),
                        image: '',
                        name: parseNameFromAddress(fromValue),
                        starred: false,
                        bin: false,
                        archived: false,
                        read: false,
                        type: emailType,
                        messageId,
                        in_reply_to: parsed.inReplyTo || '',
                        references: Array.isArray(parsed.references) ? parsed.references : [],
                        labels: [],
                        attachments
                    };

                    if (isDbConnected()) {
                        const existing = await Email.findOne({ messageId: payload.messageId });
                        if (existing) {
                            skipped++;
                            continue;
                        }

                        const emailDoc = await Email.create(payload);
                        if (!emailDoc) {
                            skipped++;
                        } else {
                            synced++;
                        }
                    } else {
                        persistCachedEmail(payload);
                        synced++;
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
        return { synced, skipped };
    } catch (error) {
        try {
            await client.logout();
        } catch (ignored) {}

        return {
            synced,
            skipped,
            error: error?.message || 'Command failed',
            code: error?.code,
            command: error?.command
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

    syncOnce().catch(err => console.error('Mail sync failed:', err.message));
    syncInterval = setInterval(() => {
        syncOnce().catch(err => console.error('Mail sync failed:', err.message));
    }, intervalMs);
};

export const syncMailboxNow = async () => syncOnce();
