import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { deleteAttachmentFile } from './attachments.js';
import { normalizeThreadSubject } from '../utils/thread-subject.js';

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const buildDeterministicEmailId = (messageId = '') => (
    `email-${crypto.createHash('sha1').update(String(messageId)).digest('hex').slice(0, 24)}`
);

const replaceAttachments = async (queryable, emailId, attachments = []) => {
    const existingResult = await queryable.query(
        'SELECT storage_path FROM attachments WHERE email_id = $1',
        [emailId]
    );
    const existingPaths = (existingResult.rows || [])
        .map((row) => String(row.storage_path || ''))
        .filter(Boolean);
    const nextPaths = new Set(
        attachments
            .map((attachment) => String(attachment.storage_path || ''))
            .filter(Boolean)
    );

    await queryable.query(
        'DELETE FROM attachments WHERE email_id = $1',
        [emailId]
    );

    for (const attachment of attachments) {
        await queryable.query(
            `INSERT INTO attachments (
                id, email_id, attachment_id, filename, content_type, size, storage_path
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7
            )`,
            [
                uuidv4(),
                emailId,
                String(attachment.attachment_id || uuidv4()),
                String(attachment.filename || 'attachment'),
                String(attachment.content_type || 'application/octet-stream'),
                Number(attachment.size || 0),
                String(attachment.storage_path || '')
            ]
        );
    }

    return existingPaths.filter((storagePath) => !nextPaths.has(storagePath));
};

const normalizeEmailPayload = (payload = {}) => ({
    id: String(payload._id || payload.id || (payload.messageId || payload.message_id
        ? buildDeterministicEmailId(payload.messageId || payload.message_id)
        : uuidv4())),
    message_id: payload.messageId || payload.message_id || null,
    type: String(payload.type || 'inbox'),
    subject: String(payload.subject || ''),
    body: String(payload.body || ''),
    body_html: String(payload.body_html || ''),
    from_address: String(payload.from || payload.from_address || ''),
    to_address: String(payload.to || payload.to_address || ''),
    cc_address: String(payload.cc || payload.cc_address || ''),
    bcc_address: String(payload.bcc || payload.bcc_address || ''),
    date_value: payload.date || payload.date_value || new Date().toISOString(),
    name: String(payload.name || ''),
    image: String(payload.image || ''),
    read: Boolean(payload.read),
    starred: Boolean(payload.starred),
    bin: Boolean(payload.bin),
    archived: Boolean(payload.archived),
    spam: Boolean(payload.spam),
    in_inbox: payload.in_inbox !== false,
    labels: normalizeArray(payload.labels),
    references_json: normalizeArray(payload.references || payload.references_json),
    in_reply_to: String(payload.in_reply_to || ''),
    read_summary: String(payload.read_summary || ''),
    read_summary_status: String(payload.read_summary_status || ''),
    read_summary_at: payload.read_summary_at || null,
    read_aloud_status: String(payload.read_aloud_status || ''),
    imap_mailbox: String(payload.imap_mailbox || 'INBOX'),
    imap_uid: String(payload.imap_uid || ''),
    muted_until: payload.muted_until || null,
    snoozed_until: payload.snoozed_until || null,
    scheduled_send_at: payload.scheduled_send_at || null
});

export const mapEmailRowToMailboxEmail = (row = {}) => ({
    _id: row.id,
    messageId: row.message_id || '',
    type: row.type || '',
    subject: row.subject || '',
    body: row.body || '',
    body_html: row.body_html || '',
    from: row.from_address || '',
    to: row.to_address || '',
    cc: row.cc_address || '',
    bcc: row.bcc_address || '',
    date: row.date_value,
    name: row.name || '',
    image: row.image || '',
    read: Boolean(row.read),
    starred: Boolean(row.starred),
    bin: Boolean(row.bin),
    archived: Boolean(row.archived),
    spam: Boolean(row.spam),
    in_inbox: row.in_inbox !== false,
    labels: normalizeArray(row.labels),
    references: normalizeArray(row.references_json),
    in_reply_to: row.in_reply_to || '',
    read_summary: row.read_summary || '',
    read_summary_status: row.read_summary_status || '',
    read_summary_at: row.read_summary_at || null,
    read_aloud_status: row.read_aloud_status || '',
    imap_mailbox: row.imap_mailbox || 'INBOX',
    imap_uid: row.imap_uid || '',
    muted_until: row.muted_until || null,
    snoozed_until: row.snoozed_until || null,
    scheduled_send_at: row.scheduled_send_at || null,
    attachments: normalizeArray(row.attachments)
});

const buildWhereClause = (filter = {}) => {
    const conditions = [];
    const values = [];
    let index = 1;

    if (filter.type) {
        conditions.push(`e.type = $${index}`);
        values.push(String(filter.type));
        index += 1;
    }

    const readValue = filter.read !== undefined
        ? Boolean(filter.read)
        : (filter.unread === true ? false : undefined);

    if (readValue !== undefined) {
        conditions.push(`e.read = $${index}`);
        values.push(readValue);
        index += 1;
    }

    for (const field of ['starred', 'bin', 'archived', 'spam', 'in_inbox']) {
        if (filter[field] === undefined) {
            continue;
        }

        conditions.push(`e.${field} = $${index}`);
        values.push(Boolean(filter[field]));
        index += 1;
    }

    if (filter.label) {
        conditions.push(`e.labels ? $${index}`);
        values.push(String(filter.label));
        index += 1;
    }

    if (filter.from) {
        conditions.push(`LOWER(e.from_address) LIKE $${index}`);
        values.push(`%${String(filter.from).toLowerCase()}%`);
        index += 1;
    }

    if (filter.to) {
        conditions.push(`LOWER(CONCAT_WS(' ', e.to_address, e.cc_address)) LIKE $${index}`);
        values.push(`%${String(filter.to).toLowerCase()}%`);
        index += 1;
    }

    if (filter.subject) {
        conditions.push(`LOWER(e.subject) LIKE $${index}`);
        values.push(`%${String(filter.subject).toLowerCase()}%`);
        index += 1;
    }

    if (filter.has_attachment) {
        conditions.push(`EXISTS (
            SELECT 1 FROM attachments a_has
            WHERE a_has.email_id = e.id
        )`);
    }

    if (filter.exclude_snoozed) {
        conditions.push(`(e.snoozed_until IS NULL OR e.snoozed_until <= NOW())`);
    }

    if (filter.exclude_muted) {
        conditions.push(`(e.muted_until IS NULL OR e.muted_until <= NOW())`);
    }

    if (filter.scheduled_due) {
        conditions.push(`e.scheduled_send_at IS NOT NULL AND e.scheduled_send_at <= NOW()`);
    }

    if (filter.search) {
        conditions.push(`(
            LOWER(CONCAT_WS(' ', e.subject, e.body, e.body_html, e.from_address, e.to_address, e.cc_address)) LIKE $${index}
            OR EXISTS (
                SELECT 1
                FROM attachments a_search
                WHERE a_search.email_id = e.id
                  AND LOWER(COALESCE(a_search.filename, '')) LIKE $${index}
            )
        )`);
        values.push(`%${String(filter.search).toLowerCase()}%`);
        index += 1;
    }

    if (filter.participant) {
        conditions.push(`LOWER(CONCAT_WS(' ', e.from_address, e.to_address, e.cc_address)) LIKE $${index}`);
        values.push(`%${String(filter.participant).toLowerCase()}%`);
        index += 1;
    }

    return {
        text: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
        values
    };
};

const EMAIL_SELECT = `
SELECT
    e.*,
    COALESCE(
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'attachment_id', a.attachment_id,
                'filename', a.filename,
                'content_type', a.content_type,
                'size', a.size,
                'storage_path', a.storage_path
            )
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'::json
    ) AS attachments
FROM emails e
LEFT JOIN attachments a ON a.email_id = e.id
`;

export const createMailboxRepository = ({ pool, deleteAttachmentFileFn = deleteAttachmentFile }) => {
    if (!pool?.query && !pool?.connect) {
        throw new Error('A Postgres pool with query(text, values) is required.');
    }

    return {
        async list(filter = {}) {
            const where = buildWhereClause(filter);
            const result = await pool.query(
                `${EMAIL_SELECT}
                ${where.text}
                GROUP BY e.id
                ORDER BY e.date_value DESC`,
                where.values
            );

            return result.rows.map(mapEmailRowToMailboxEmail);
        },

        async count(filter = {}) {
            const where = buildWhereClause(filter);
            const result = await pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM emails e
                 ${where.text}`,
                where.values
            );

            return Number(result.rows[0]?.total || 0);
        },

        async search(query = '') {
            const searchTerm = `%${String(query).toLowerCase()}%`;
            const result = await pool.query(
                `${EMAIL_SELECT}
                 WHERE (
                    LOWER(CONCAT_WS(' ', e.subject, e.body, e.body_html, e.from_address, e.to_address, e.cc_address)) LIKE $1
                    OR EXISTS (
                        SELECT 1
                        FROM attachments a_search
                        WHERE a_search.email_id = e.id
                          AND LOWER(COALESCE(a_search.filename, '')) LIKE $1
                    )
                 )
                 GROUP BY e.id
                 ORDER BY e.date_value DESC`,
                [searchTerm]
            );

            return result.rows.map(mapEmailRowToMailboxEmail);
        },

        async findById(id) {
            const result = await pool.query(
                `${EMAIL_SELECT}
                 WHERE e.id = $1
                 GROUP BY e.id
                 LIMIT 1`,
                [id]
            );

            if (!result.rows[0]) {
                return null;
            }

            return mapEmailRowToMailboxEmail(result.rows[0]);
        },

        async findByMessageId(messageId) {
            const needle = String(messageId || '').trim();
            if (!needle) {
                return null;
            }

            const result = await pool.query(
                `${EMAIL_SELECT}
                 WHERE e.message_id = $1
                 GROUP BY e.id
                 LIMIT 1`,
                [needle]
            );

            if (!result.rows[0]) {
                return null;
            }

            return mapEmailRowToMailboxEmail(result.rows[0]);
        },

        async findThread(anchorEmail = {}) {
            const relatedIds = [
                anchorEmail.messageId || anchorEmail.message_id,
                anchorEmail.in_reply_to,
                ...(anchorEmail.references || anchorEmail.references_json || [])
            ]
                .map((value) => String(value || '').trim())
                .filter(Boolean);
            const subjectKey = normalizeThreadSubject(anchorEmail.subject);

            if (!relatedIds.length && !subjectKey) {
                return [];
            }

            const result = await pool.query(
                `WITH RECURSIVE related_ids(message_id) AS (
                    SELECT UNNEST($1::text[])
                    UNION
                    SELECT e.message_id
                    FROM emails e
                    JOIN related_ids r
                      ON r.message_id <> ''
                     AND (
                        e.message_id = r.message_id
                        OR e.in_reply_to = r.message_id
                        OR e.references_json ? r.message_id
                     )
                    WHERE e.message_id IS NOT NULL AND e.message_id <> ''
                )
                ${EMAIL_SELECT}
                WHERE (
                    e.message_id IN (SELECT message_id FROM related_ids)
                    OR LOWER(REGEXP_REPLACE(e.subject, '^((re|fwd|fw):\\s*)+', '', 'i')) = $2
                )
                GROUP BY e.id
                ORDER BY e.date_value DESC`,
                [relatedIds, subjectKey]
            );

            return result.rows.map(mapEmailRowToMailboxEmail);
        },

        async upsert(payload = {}) {
            const email = normalizeEmailPayload(payload);
            const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
            let replacedPaths = [];
            let result;
            try {
                await client.query('BEGIN');
                result = await client.query(
                `INSERT INTO emails (
                    id, message_id, type, subject, body, body_html, from_address, to_address,
                    cc_address, bcc_address, date_value, name, image, read, labels, references_json,
                    starred, bin, archived, spam, in_inbox, in_reply_to, read_summary,
                    read_summary_status, read_summary_at, read_aloud_status, imap_mailbox, imap_uid,
                    scheduled_send_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb,
                    $17, $18, $19, $20, $21, $22, $23,
                    $24, $25, $26, $27, $28,
                    $29
                )
                ON CONFLICT (id)
                DO UPDATE SET
                    type = EXCLUDED.type,
                    subject = EXCLUDED.subject,
                    body = EXCLUDED.body,
                    body_html = EXCLUDED.body_html,
                    from_address = EXCLUDED.from_address,
                    to_address = EXCLUDED.to_address,
                    cc_address = EXCLUDED.cc_address,
                    bcc_address = EXCLUDED.bcc_address,
                    date_value = EXCLUDED.date_value,
                    name = EXCLUDED.name,
                    image = EXCLUDED.image,
                    read = emails.read OR EXCLUDED.read,
                    references_json = EXCLUDED.references_json,
                    in_reply_to = EXCLUDED.in_reply_to,
                    read_summary = EXCLUDED.read_summary,
                    read_summary_status = EXCLUDED.read_summary_status,
                    read_summary_at = EXCLUDED.read_summary_at,
                    read_aloud_status = EXCLUDED.read_aloud_status,
                    imap_mailbox = EXCLUDED.imap_mailbox,
                    imap_uid = EXCLUDED.imap_uid,
                    scheduled_send_at = COALESCE(EXCLUDED.scheduled_send_at, emails.scheduled_send_at),
                    -- Keep mailbox taxonomy set by the UI (archive/bin/spam/star).
                    starred = emails.starred,
                    bin = emails.bin,
                    archived = emails.archived,
                    spam = emails.spam,
                    in_inbox = emails.in_inbox,
                    labels = emails.labels,
                    muted_until = emails.muted_until,
                    snoozed_until = emails.snoozed_until,
                    updated_at = NOW()
                RETURNING *`,
                [
                    email.id,
                    email.message_id,
                    email.type,
                    email.subject,
                    email.body,
                    email.body_html,
                    email.from_address,
                    email.to_address,
                    email.cc_address,
                    email.bcc_address,
                    email.date_value,
                    email.name,
                    email.image,
                    email.read,
                    JSON.stringify(email.labels),
                    JSON.stringify(email.references_json),
                    email.starred,
                    email.bin,
                    email.archived,
                    email.spam,
                    email.in_inbox,
                    email.in_reply_to,
                    email.read_summary,
                    email.read_summary_status,
                    email.read_summary_at,
                    email.read_aloud_status,
                    email.imap_mailbox,
                    email.imap_uid,
                    email.scheduled_send_at
                ]
            );

                replacedPaths = await replaceAttachments(client, result.rows[0].id, payload.attachments || []);
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release?.();
            }

            replacedPaths.forEach((storagePath) => {
                try {
                    deleteAttachmentFileFn(storagePath);
                } catch (error) {
                    console.error(`Failed to delete replaced attachment file ${storagePath}:`, error.message || error);
                }
            });
            return mapEmailRowToMailboxEmail({
                ...result.rows[0],
                attachments: normalizeArray(payload.attachments || result.rows[0]?.attachments)
            });
        },

        async updateMany(ids = [], updates = {}) {
            if (!Array.isArray(ids) || ids.length === 0) {
                return 0;
            }

            const entries = Object.entries(updates);
            if (!entries.length) {
                return 0;
            }

            const values = [];
            const setClauses = entries.map(([key, value], index) => {
                values.push((key === 'labels' || key === 'references_json') ? JSON.stringify(value ?? []) : value);
                const placeholder = `$${index + 1}`;
                if (key === 'labels' || key === 'references_json') {
                    return `${key} = ${placeholder}::jsonb`;
                }
                return `${key} = ${placeholder}`;
            });
            values.push(ids);

            const result = await pool.query(
                `UPDATE emails
                 SET ${setClauses.join(', ')}, updated_at = NOW()
                 WHERE id = ANY($${values.length})`,
                values
            );

            return Number(result.rowCount || 0);
        },

        async deleteMany(ids = []) {
            if (!Array.isArray(ids) || ids.length === 0) {
                return 0;
            }

            const attachmentsResult = await pool.query(
                'SELECT DISTINCT storage_path FROM attachments WHERE email_id = ANY($1)',
                [ids]
            );
            const storagePaths = (attachmentsResult.rows || [])
                .map((row) => String(row.storage_path || ''))
                .filter(Boolean);

            const result = await pool.query(
                'DELETE FROM emails WHERE id = ANY($1)',
                [ids]
            );

            for (const storagePath of storagePaths) {
                deleteAttachmentFileFn(storagePath);
            }

            return Number(result.rowCount || 0);
        }
    };
};

export { buildWhereClause };
