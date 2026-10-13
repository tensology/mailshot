import { getMailboxPool, isMailboxStoreReady } from './postgres-mailbox-store.js';

export const MESSAGE_STATE_UPDATES = Object.freeze({
    read: Object.freeze({ read: true }),
    unread: Object.freeze({ read: false }),
    archive: Object.freeze({
        archived: true,
        in_inbox: false,
        spam: false,
        bin: false,
        starred: false
    }),
    unarchive: Object.freeze({
        archived: false,
        in_inbox: true,
        spam: false,
        bin: false
    })
});

const auditValues = (request, action, resourceId, statusCode, metadata = {}) => [
    String(request.headers?.['x-request-id'] || ''),
    String(request.headers?.['x-tensology-source'] || 'api').slice(0, 32),
    String(request.tensologyService?.audience || ''),
    action,
    'mail_message',
    String(resourceId || ''),
    statusCode,
    JSON.stringify(metadata)
];

const insertAudit = async (queryable, values) => queryable.query(
    `INSERT INTO integration_audit_events (
        request_id, source, credential_audience, action,
        resource_type, resource_id, status_code, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    values
);

export const recordMessageStateAudit = async (request, action, resourceId, statusCode, metadata = {}) => {
    if (!isMailboxStoreReady()) return;
    const pool = getMailboxPool();
    if (!pool?.query) return;
    await insertAudit(pool, auditValues(request, action, resourceId, statusCode, metadata));
};

export const updateMessageStateWithAudit = async (request, messageId, action) => {
    if (!isMailboxStoreReady()) {
        const error = new Error('The authoritative mailbox store is unavailable');
        error.status = 503;
        throw error;
    }

    const updates = MESSAGE_STATE_UPDATES[action];
    if (!updates) {
        const error = new Error('Unknown message state action');
        error.status = 400;
        throw error;
    }

    const pool = getMailboxPool();
    const client = typeof pool?.connect === 'function' ? await pool.connect() : pool;
    if (!client?.query) {
        const error = new Error('The authoritative mailbox store is unavailable');
        error.status = 503;
        throw error;
    }

    try {
        await client.query('BEGIN');
        const existing = await client.query(
            `SELECT id, read, archived, in_inbox
             FROM emails
             WHERE id = $1
             FOR UPDATE`,
            [String(messageId)]
        );
        if (!existing.rows?.[0]) {
            await insertAudit(client, auditValues(request, `mail.message.${action}`, messageId, 404));
            await client.query('COMMIT');
            return null;
        }

        const entries = Object.entries(updates);
        const values = entries.map(([, value]) => value);
        values.push(String(messageId));
        const setSql = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
        const result = await client.query(
            `UPDATE emails
             SET ${setSql}, updated_at = NOW()
             WHERE id = $${values.length}
             RETURNING id, read, archived, in_inbox`,
            values
        );
        const state = result.rows[0];
        await insertAudit(client, auditValues(
            request,
            `mail.message.${action}`,
            messageId,
            200,
            { read: Boolean(state.read), archived: Boolean(state.archived), in_inbox: state.in_inbox !== false }
        ));
        await client.query('COMMIT');
        return state;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release?.();
    }
};
