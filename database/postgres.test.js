import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createPostgresPool,
    getPostgresConfig,
    isPostgresConfigured
} from './postgres.js';
import { ensurePostgresSchema } from './postgres-schema.js';

test('uses DATABASE_URL when provided', () => {
    const config = getPostgresConfig({
        DATABASE_URL: 'postgres://mailshot:secret@db.example.com:5432/mailshot',
        PGHOST: 'ignored.example.com'
    });

    assert.deepEqual(config, {
        connectionString: 'postgres://mailshot:secret@db.example.com:5432/mailshot',
        ssl: undefined
    });
});

test('builds a Postgres config from PG* variables', () => {
    const config = getPostgresConfig({
        PGHOST: 'db.example.com',
        PGPORT: '5433',
        PGDATABASE: 'mailshot',
        PGUSER: 'mailshot',
        PGPASSWORD: 'secret',
        PGSSL: 'true'
    });

    assert.deepEqual(config, {
        host: 'db.example.com',
        port: 5433,
        database: 'mailshot',
        user: 'mailshot',
        password: 'secret',
        ssl: { rejectUnauthorized: false }
    });
});

test('reports Postgres as configured only when connection details exist', () => {
    assert.equal(isPostgresConfigured({}), false);
    assert.equal(isPostgresConfigured({ PGHOST: 'db.example.com' }), true);
    assert.equal(isPostgresConfigured({ DATABASE_URL: 'postgres://db/mailshot' }), true);
});

test('creates a Pool instance from the computed config', () => {
    class FakePool {
        constructor(config) {
            this.config = config;
        }
    }

    const pool = createPostgresPool({
        env: { PGHOST: 'db.example.com', PGDATABASE: 'mailshot' },
        PoolImpl: FakePool
    });

    assert.ok(pool instanceof FakePool);
    assert.equal(pool.config.host, 'db.example.com');
    assert.equal(pool.config.database, 'mailshot');
});

test('bootstraps the mailbox schema with the required tables', async () => {
    const queries = [];
    const pool = {
        query: async (sql) => {
            queries.push(String(sql));
            return { rows: [] };
        }
    };

    await ensurePostgresSchema(pool);

    assert.equal(queries.length, 1);
    assert.match(queries[0], /CREATE TABLE IF NOT EXISTS emails/i);
    assert.match(queries[0], /CREATE TABLE IF NOT EXISTS attachments/i);
    assert.match(queries[0], /CREATE TABLE IF NOT EXISTS mailbox_ingest_jobs/i);
    assert.match(queries[0], /CREATE INDEX IF NOT EXISTS emails_in_reply_to_idx/i);
    assert.match(queries[0], /CREATE INDEX IF NOT EXISTS emails_references_json_gin_idx/i);
    assert.match(queries[0], /CREATE INDEX IF NOT EXISTS emails_date_value_idx/i);
    assert.match(queries[0], /CREATE INDEX IF NOT EXISTS emails_thread_subject_idx/i);
    assert.match(queries[0], /CREATE INDEX IF NOT EXISTS attachments_email_id_idx/i);
});
