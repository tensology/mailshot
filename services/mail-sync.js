import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';

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
        user: process.env.MAILBOX_USER || process.env.MAIL_USERNAME,
        pass: process.env.MAILBOX_PASSWORD || process.env.MAIL_PASSWORD
    }
});

const getMailboxUser = () => (process.env.MAILBOX_USER || process.env.MAIL_USERNAME || '').toLowerCase();

let syncInterval;
const mailboxCache = [];

const parseNameFromAddress = (value = '') => {
    const match = /^\"?([^<>"]+)\"?\s*<[^>]+>$/.exec(value || '');
    return match ? match[1].trim() : (value || '').split('@')[0] || 'Unknown';
};

const persistCachedEmail = (payload = {}) => {
    const existing = mailboxCache.findIndex(item => item.messageId === payload.messageId);
    const normalized = {
        _id: payload._id || `cache-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...payload,
        date: new Date(payload.date || Date.now())
    };

    if (existing >= 0) {
        mailboxCache[existing] = { ...mailboxCache[existing], ...normalized };
    } else {
        mailboxCache.push(normalized);
    }

    return normalized;
};

export const getCachedEmails = (filter = {}) => {
    return mailboxCache
        .filter((item) => {
            if (filter.bin !== undefined && filter.bin !== item.bin) return false;
            if (filter.starred !== undefined && filter.starred !== item.starred) return false;
            if (filter.type && filter.type !== item.type) return false;
            return true;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
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
            const mailboxUser = getMailboxUser();

            for await (const msg of client.fetch(fetchSet, { uid: true, source: true, envelope: true, internalDate: true })) {
                try {
                    const parsed = await simpleParser(msg.source);
                    const fromValue = createAddressString(parsed.from);
                    const toValue = createAddressString(parsed.to);
                    const subject = parsed.subject || msg.envelope?.subject || '';
                    const messageId = parsed.messageId || `${msg.uid}-${mailbox}`;
                    const normalizedFrom = fromValue.toLowerCase();
                    const emailType = normalizedFrom === mailboxUser ? 'sent' : 'inbox';

                    const payload = {
                        to: toValue,
                        from: fromValue,
                        subject,
                        body: parsed.text || stripHtml(parsed.html || ''),
                        date: msg.internalDate || parsed.date || new Date(),
                        image: '',
                        name: parseNameFromAddress(fromValue),
                        starred: false,
                        bin: false,
                        type: emailType,
                        messageId
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
