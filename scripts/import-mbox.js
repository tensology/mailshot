/**
 * Import emails from a Gmail/Google Takeout .mbox file into Mailshot.
 *
 * Usage:
 *   node scripts/import-mbox.js <path_to_mbox_file> [--dry-run]
 *
 * Persists to data/mailbox-cache.json when MongoDB is not available.
 * Restart the app after import to load into the running process, or run while the app is stopped.
 */
import 'dotenv/config';
import fs from 'fs';
import { simpleParser } from 'mailparser';
import {
    iterateMboxMessages,
    stripMboxDelimiter,
    parseGmailLabels,
    isStarredFromGmailLabels
} from './mbox-utils.js';
import Email from '../model/email.js';
import Connection, { isDbConnected } from '../database/db.js';
import {
    upsertCachedEmail,
    loadMailboxCacheFromDisk,
    saveMailboxCacheToDisk,
    getCachedEmails
} from '../services/mail-sync.js';
import { normalizeLabelToken } from '../services/label-store.js';
import { upsertCachedContact } from '../services/contact-store.js';

const SYSTEM_LABELS = new Set([
    'Trash',
    'Opened',
    'Important',
    'Category Updates',
    'Category Forums',
    'Category Social',
    'Category Promotions',
    'Category Primary',
    'Category Bills',
    'Category Personal',
    'Sent',
    'Inbox',
    'Draft',
    'Drafts',
    'Starred',
    'Unread'
]);

const decodeHtmlEntities = (value = '') => String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const stripHtml = (value = '') => decodeHtmlEntities(
    String(value)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
).trim();

const normalizeAddress = (value = '') => {
    const plain = String(value || '').trim().toLowerCase();
    const bracketMatch = /<([^>]+)>/.exec(plain);
    return (bracketMatch ? bracketMatch[1] : plain).trim();
};

const parseNameFromAddress = (value = '') => {
    const match = /^"?([^<>"]+)"?\s*<[^>]+>$/.exec(value || '');
    return match ? match[1].trim() : (value || '').split('@')[0] || 'Unknown';
};

const createAddressString = (addressObject = {}) => {
    if (!addressObject) return '';
    if (addressObject.text) return addressObject.text;
    if (Array.isArray(addressObject.value) && addressObject.value.length > 0) {
        return addressObject.value[0]?.address || '';
    }
    return '';
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

const buildEmailPayload = (parsed, gmailLabels) => {
    const fromValue = createAddressString(parsed.from);
    const toValue = createAddressString(parsed.to);
    const ccValue = createAddressString(parsed.cc);
    const isTrash = gmailLabels.includes('Trash');
    const isSentLabel = gmailLabels.includes('Sent');
    const isDraft = gmailLabels.includes('Draft') || gmailLabels.includes('Drafts');
    const isRead = gmailLabels.includes('Opened') || !gmailLabels.includes('Unread');
    const isStarred = isStarredFromGmailLabels(gmailLabels);

    let type = 'inbox';
    if (isDraft) {
        type = 'drafts';
    } else if (isSentLabel || isMailboxSender(fromValue)) {
        type = 'sent';
    }

    const subject = decodeHtmlEntities(parsed.subject || '');
    const bodyText = parsed.text || stripHtml(parsed.html || '');

    return {
        to: toValue || '',
        cc: ccValue || '',
        from: fromValue || 'unknown@unknown',
        subject,
        body: bodyText,
        body_html: typeof parsed.html === 'string' ? parsed.html : '',
        date: parsed.date || new Date(),
        image: '',
        name: parseNameFromAddress(fromValue),
        read: isRead,
        type,
        messageId: parsed.messageId,
        in_reply_to: parsed.inReplyTo || '',
        references: Array.isArray(parsed.references) ? parsed.references : [],
        attachments: [],
        starred: isStarred,
        bin: isTrash,
        archived: false,
        labels: gmailLabels
            .filter((label) => !SYSTEM_LABELS.has(label))
            .map((label) => normalizeLabelToken(label))
            .filter(Boolean)
    };
};

const extractAddresses = (value = '') => {
    const results = [];
    const chunks = String(value).split(',');

    chunks.forEach((chunk) => {
        const trimmed = chunk.trim();
        if (!trimmed) {
            return;
        }

        const bracketMatch = /<([^>]+)>/.exec(trimmed);
        const email = (bracketMatch ? bracketMatch[1] : trimmed).trim().toLowerCase();
        if (!email.includes('@')) {
            return;
        }

        results.push({
            email,
            name: parseNameFromAddress(trimmed)
        });
    });

    return results;
};

const importContactsFromPayload = (payload) => {
    const addresses = [
        ...extractAddresses(payload.from),
        ...extractAddresses(payload.to),
        ...extractAddresses(payload.cc)
    ];

    addresses.forEach((entry) => {
        if (mailboxIdentity.includes(entry.email)) {
            return;
        }
        if (/^(no-?reply|mailer-daemon|postmaster)@/i.test(entry.email)) {
            return;
        }
        upsertCachedContact(entry);
    });
};

async function importMbox(mboxFilePath, { dryRun = false } = {}) {
    if (!fs.existsSync(mboxFilePath)) {
        throw new Error(`Mbox file not found: ${mboxFilePath}`);
    }

    const stats = fs.statSync(mboxFilePath);
    console.log(`Importing from ${mboxFilePath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`Mailbox identities: ${mailboxIdentity.join(', ')}`);
    console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);

    Connection();

    // Wait briefly for MongoDB connection attempt
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const dbConnected = isDbConnected();
    console.log(`MongoDB connected: ${dbConnected}`);

    if (!dbConnected) {
        const loaded = loadMailboxCacheFromDisk();
        console.log(`Loaded ${loaded} existing emails from disk cache`);
    }

    const knownMessageIds = new Set();
    if (dbConnected) {
        const existing = await Email.find({}, { messageId: 1 }).lean();
        existing.forEach((doc) => {
            if (doc.messageId) knownMessageIds.add(doc.messageId);
        });
    } else {
        getCachedEmails({}).forEach((item) => {
            if (item.messageId) knownMessageIds.add(item.messageId);
        });
    }

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    const typeCounts = { inbox: 0, sent: 0, drafts: 0, bin: 0 };

    for await (const rawBlock of iterateMboxMessages(mboxFilePath)) {
        processedCount += 1;

        if (!rawBlock.trim()) {
            continue;
        }

        try {
            const messageSource = stripMboxDelimiter(rawBlock);
            const parsed = await simpleParser(messageSource);

            if (!parsed.messageId) {
                skippedCount += 1;
                continue;
            }

            if (knownMessageIds.has(parsed.messageId)) {
                skippedCount += 1;
                continue;
            }

            const gmailLabels = parseGmailLabels(parsed);
            const payload = buildEmailPayload(parsed, gmailLabels);

            if (dryRun) {
                importedCount += 1;
                typeCounts[payload.type] = (typeCounts[payload.type] || 0) + 1;
                if (payload.bin) typeCounts.bin += 1;
                knownMessageIds.add(parsed.messageId);
                continue;
            }

            if (dbConnected) {
                await Email.create(payload);
            } else {
                upsertCachedEmail(payload);
            }

            importContactsFromPayload(payload);

            knownMessageIds.add(parsed.messageId);
            importedCount += 1;
            typeCounts[payload.type] = (typeCounts[payload.type] || 0) + 1;
            if (payload.bin) typeCounts.bin += 1;

            if (!dbConnected && importedCount % 200 === 0) {
                saveMailboxCacheToDisk();
                console.log(`Progress: ${importedCount} imported, ${skippedCount} skipped...`);
            }
        } catch (error) {
            errorCount += 1;
            if (errorCount <= 10) {
                console.error(`Error at message ${processedCount}: ${error.message}`);
            }
        }
    }

    if (!dryRun && !dbConnected) {
        saveMailboxCacheToDisk();
    }

    console.log('\n--- Import summary ---');
    console.log(`Processed: ${processedCount}`);
    console.log(`Imported:  ${importedCount}`);
    console.log(`Skipped:   ${skippedCount} (duplicates / missing message-id)`);
    console.log(`Errors:    ${errorCount}`);
    console.log(`By type:   inbox=${typeCounts.inbox || 0}, sent=${typeCounts.sent || 0}, drafts=${typeCounts.drafts || 0}, in-bin=${typeCounts.bin || 0}`);

    if (!dryRun && !dbConnected) {
        console.log(`\nSaved to data/mailbox-cache.json — restart the app to load the imported mailbox.`);
    }

    return { importedCount, skippedCount, errorCount, typeCounts };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mboxFilePath = args.find((arg) => !arg.startsWith('--'));

if (!mboxFilePath) {
    console.error('Usage: node scripts/import-mbox.js <path_to_mbox_file> [--dry-run]');
    process.exit(1);
}

importMbox(mboxFilePath, { dryRun })
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Import failed:', error.message);
        process.exit(1);
    });
