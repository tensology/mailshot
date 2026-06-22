/**
 * Rebuild label definitions and contacts from the mailbox disk cache.
 * Normalizes email label tokens to slugs and persists labels/contacts to data/.
 *
 * Usage:
 *   node scripts/sync-labels-and-contacts.js
 */
import 'dotenv/config';
import {
    loadMailboxCacheFromDisk,
    saveMailboxCacheToDisk,
    getCachedEmails,
    updateCachedEmail
} from '../services/mail-sync.js';
import {
    loadLabelsFromDisk,
    ensureCachedLabel,
    normalizeLabelToken,
    saveLabelsToDisk,
    getCachedLabels
} from '../services/label-store.js';
import {
    loadContactsFromDisk,
    upsertCachedContact,
    saveContactsToDisk,
    getCachedContacts
} from '../services/contact-store.js';

const normalizeAddress = (value = '') => {
    const plain = String(value || '').trim().toLowerCase();
    const bracketMatch = /<([^>]+)>/.exec(plain);
    return (bracketMatch ? bracketMatch[1] : plain).trim();
};

const parseNameFromAddress = (value = '') => {
    const match = /^"?([^<>"]+)"?\s*<[^>]+>$/.exec(value || '');
    return match ? match[1].trim() : (value || '').split('@')[0] || 'Unknown';
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

const extractAddresses = (value = '') => {
    const results = [];
    String(value).split(',').forEach((chunk) => {
        const trimmed = chunk.trim();
        if (!trimmed) {
            return;
        }

        const email = normalizeAddress(trimmed);
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

const importContactsFromEmail = (email) => {
    const addresses = [
        ...extractAddresses(email.from),
        ...extractAddresses(email.to),
        ...extractAddresses(email.cc)
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

const syncLabelsAndContacts = () => {
    const loadedEmails = loadMailboxCacheFromDisk();
    loadLabelsFromDisk();
    loadContactsFromDisk();

    console.log(`Loaded ${loadedEmails} emails from mailbox cache`);

    let labelsNormalized = 0;
    let contactsAdded = 0;
    const contactCountBefore = getCachedContacts().length;

    getCachedEmails({}).forEach((email) => {
        const nextLabels = [...new Set(
            (email.labels || [])
                .map((label) => normalizeLabelToken(label))
                .filter(Boolean)
        )];

        const labelUpdates = { labels: nextLabels };
        if (nextLabels.length > 0 && email.in_inbox !== false) {
            labelUpdates.in_inbox = false;
        }

        if (JSON.stringify(nextLabels) !== JSON.stringify(email.labels || [])
            || (labelUpdates.in_inbox === false && email.in_inbox !== false)) {
            updateCachedEmail(email._id, labelUpdates);
            labelsNormalized += 1;
        }

        nextLabels.forEach((slug) => ensureCachedLabel(slug));

        importContactsFromEmail(email);
    });

    saveMailboxCacheToDisk();
    saveLabelsToDisk();
    saveContactsToDisk();

    contactsAdded = getCachedContacts().length - contactCountBefore;

    console.log('\n--- Sync summary ---');
    console.log(`Labels in sidebar: ${getCachedLabels().length}`);
    console.log(`Emails relabeled:  ${labelsNormalized}`);
    console.log(`Contacts total:    ${getCachedContacts().length} (${contactsAdded} new)`);
    getCachedLabels().forEach((label) => {
        console.log(`  - ${label.name} (${label.slug})`);
    });
};

syncLabelsAndContacts();
