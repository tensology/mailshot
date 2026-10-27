import { randomUUID } from 'crypto';
import { getMailboxPool, isMailboxStoreReady } from './postgres-mailbox-store.js';

const requirePool = () => {
    if (!isMailboxStoreReady()) {
        throw new Error('Mailbox store is not ready');
    }
    return getMailboxPool();
};

const mapThread = (row = {}) => ({
    id: row.id,
    title: row.title || 'Untitled',
    status: row.status || 'idle',
    usage: row.usage || {},
    created_at: row.created_at,
    updated_at: row.updated_at
});

const mapMessage = (row = {}) => ({
    id: row.id,
    thread_id: row.thread_id,
    role: row.role,
    content: row.content || '',
    meta: row.meta || {},
    created_at: row.created_at
});

export const listThreads = async () => {
    const pool = requirePool();
    const result = await pool.query(
        'SELECT id, title, status, usage, created_at, updated_at FROM dev_threads ORDER BY updated_at DESC LIMIT 100'
    );
    return result.rows.map(mapThread);
};

export const createThread = async ({ title = 'New thread' } = {}) => {
    const pool = requirePool();
    const id = `dev-${randomUUID()}`;
    const result = await pool.query(
        'INSERT INTO dev_threads (id, title) VALUES ($1, $2) RETURNING id, title, status, usage, created_at, updated_at',
        [id, String(title || 'New thread').slice(0, 120)]
    );
    return mapThread(result.rows[0]);
};

export const getThread = async (id) => {
    const pool = requirePool();
    const result = await pool.query(
        'SELECT id, title, status, usage, created_at, updated_at FROM dev_threads WHERE id = $1',
        [id]
    );
    return result.rows[0] ? mapThread(result.rows[0]) : null;
};

export const touchThread = async (id, { status, title } = {}) => {
    const pool = requirePool();
    await pool.query(
        `UPDATE dev_threads
         SET status = COALESCE($2, status),
             title = COALESCE($3, title),
             updated_at = NOW()
         WHERE id = $1`,
        [id, status || null, title || null]
    );
};

// Add one run's real provider usage (cost + tokens) to the thread's session total.
export const addThreadUsage = async (id, delta = {}) => {
    const pool = requirePool();
    const result = await pool.query(
        `UPDATE dev_threads
         SET usage = jsonb_build_object(
                 'cost', COALESCE((usage->>'cost')::numeric, 0) + $2::numeric,
                 'input', COALESCE((usage->>'input')::numeric, 0) + $3::numeric,
                 'output', COALESCE((usage->>'output')::numeric, 0) + $4::numeric,
                 'cacheRead', COALESCE((usage->>'cacheRead')::numeric, 0) + $5::numeric,
                 'cacheWrite', COALESCE((usage->>'cacheWrite')::numeric, 0) + $6::numeric,
                 'totalTokens', COALESCE((usage->>'totalTokens')::numeric, 0) + $7::numeric,
                 'runs', COALESCE((usage->>'runs')::numeric, 0) + 1
             )
         WHERE id = $1
         RETURNING usage`,
        [
            id,
            Number(delta.cost || 0),
            Number(delta.input || 0),
            Number(delta.output || 0),
            Number(delta.cacheRead || 0),
            Number(delta.cacheWrite || 0),
            Number(delta.totalTokens || 0)
        ]
    );
    return result.rows[0]?.usage || {};
};

export const deleteThread = async (id) => {
    const pool = requirePool();
    await pool.query('DELETE FROM dev_threads WHERE id = $1', [id]);
};

export const listMessages = async (threadId) => {
    const pool = requirePool();
    const result = await pool.query(
        'SELECT id, thread_id, role, content, meta, created_at FROM dev_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 500',
        [threadId]
    );
    return result.rows.map(mapMessage);
};

export const addMessage = async ({ threadId, role, content = '', meta = {} }) => {
    const pool = requirePool();
    const id = `dm-${randomUUID()}`;
    const result = await pool.query(
        `INSERT INTO dev_messages (id, thread_id, role, content, meta)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, thread_id, role, content, meta, created_at`,
        [id, threadId, role, content, JSON.stringify(meta || {})]
    );
    await touchThread(threadId, {});
    return mapMessage(result.rows[0]);
};
