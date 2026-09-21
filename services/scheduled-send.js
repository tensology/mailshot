import { sendMail } from './mailer.js';
import { getMailboxRepository, isMailboxStoreReady } from './postgres-mailbox-store.js';

const stripHtml = (value = '') => String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Send drafts whose scheduled_send_at is due.
 * ponytail: polls with mailbox sync; no separate worker process.
 */
export const processDueScheduledSends = async () => {
    if (!isMailboxStoreReady()) {
        return { sent: 0 };
    }

    const repository = getMailboxRepository();
    const due = await repository.list({
        type: 'drafts',
        scheduled_due: true
    });

    let sent = 0;
    for (const draft of due) {
        try {
            const info = await sendMail({
                to: draft.to,
                cc: draft.cc || '',
                bcc: draft.bcc || '',
                subject: draft.subject,
                body: draft.body || stripHtml(draft.body_html || ''),
                html: draft.body_html || '',
                inReplyTo: draft.in_reply_to || '',
                references: draft.references || [],
                attachments: draft.attachments || []
            });

            await repository.upsert({
                ...draft,
                _id: draft._id,
                type: 'sent',
                read: true,
                in_inbox: false,
                messageId: info.messageId || draft.messageId,
                scheduled_send_at: null,
                date: new Date()
            });
            sent += 1;
        } catch (error) {
            console.error('Scheduled send failed:', draft._id, error.message);
        }
    }

    return { sent };
};
