/**
 * Repair incorrect starred flags on imported Gmail mail.
 *
 * The original mbox import treated Gmail's "Important" label as starred.
 * Only the Gmail "Starred" label should set starred=true.
 *
 * Usage:
 *   node scripts/repair-starred-flags.js --unstar-labeled
 *   node scripts/repair-starred-flags.js <path_to_mbox_file>
 */
import 'dotenv/config';
import { simpleParser } from 'mailparser';
import {
    loadMailboxCacheFromDisk,
    saveMailboxCacheToDisk,
    updateCachedEmail,
    getCachedEmails
} from '../services/mail-sync.js';
import {
    iterateMboxMessages,
    stripMboxDelimiter,
    parseGmailLabels,
    isStarredFromGmailLabels
} from './mbox-utils.js';

const repairFromMbox = async (mboxFilePath) => {
    const loaded = loadMailboxCacheFromDisk();
    console.log(`Loaded ${loaded} emails from mailbox cache`);

    const byMessageId = new Map();
    getCachedEmails({}).forEach((email) => {
        if (email.messageId) {
            byMessageId.set(email.messageId, email);
        }
    });

    let processed = 0;
    let updated = 0;
    let starredNow = 0;

    for await (const rawBlock of iterateMboxMessages(mboxFilePath)) {
        processed += 1;

        if (!rawBlock.trim()) {
            continue;
        }

        try {
            const parsed = await simpleParser(stripMboxDelimiter(rawBlock));
            if (!parsed.messageId) {
                continue;
            }

            const cached = byMessageId.get(parsed.messageId);
            if (!cached) {
                continue;
            }

            const gmailLabels = parseGmailLabels(parsed);
            const starred = isStarredFromGmailLabels(gmailLabels);

            if (Boolean(cached.starred) !== starred) {
                updateCachedEmail(cached._id, { starred });
                updated += 1;
            }

            if (starred) {
                starredNow += 1;
            }
        } catch (error) {
            if (processed <= 5) {
                console.error(`Parse error at message ${processed}: ${error.message}`);
            }
        }

        if (processed % 500 === 0) {
            console.log(`Scanned ${processed} mbox messages, ${updated} starred flags updated...`);
        }
    }

    saveMailboxCacheToDisk();

    console.log('\n--- Repair summary (mbox) ---');
    console.log(`Mbox messages scanned: ${processed}`);
    console.log(`Starred flags updated:   ${updated}`);
    console.log(`Now starred in cache:    ${starredNow}`);
};

const unstarLabeled = () => {
    const loaded = loadMailboxCacheFromDisk();
    console.log(`Loaded ${loaded} emails from mailbox cache`);

    let updated = 0;

    getCachedEmails({}).forEach((email) => {
        if (!email.starred || !(email.labels || []).length) {
            return;
        }

        updateCachedEmail(email._id, { starred: false });
        updated += 1;
    });

    saveMailboxCacheToDisk();

    console.log('\n--- Repair summary (unstar-labeled) ---');
    console.log(`Labeled messages unstarred: ${updated}`);
    console.log('Note: for exact Gmail stars, re-run with your .mbox file instead.');
};

const args = process.argv.slice(2);
const unstarLabeledMode = args.includes('--unstar-labeled');
const mboxFilePath = args.find((arg) => !arg.startsWith('--'));

if (unstarLabeledMode) {
    unstarLabeled();
    process.exit(0);
}

if (!mboxFilePath) {
    console.error('Usage: node scripts/repair-starred-flags.js --unstar-labeled');
    console.error('   or: node scripts/repair-starred-flags.js <path_to_mbox_file>');
    process.exit(1);
}

repairFromMbox(mboxFilePath)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Repair failed:', error.message);
        process.exit(1);
    });
