import test from 'node:test';
import assert from 'node:assert/strict';

import { __setMailboxStoreForTests } from './postgres-mailbox-store.js';
import { updateMessageStateWithAudit } from './integration-message-state.js';

const request = {
    headers: { 'x-request-id': 'request-7', 'x-tensology-source': 'tensology-incoming' },
    tensologyService: { audience: 'mailshot', scopes: ['mail.service'] }
};

test.afterEach(() => {
    __setMailboxStoreForTests();
});

test('authoritative message state writes and its audit commit in one Postgres transaction', async () => {
    const queries = [];
    const client = {
        query: async (sql, values = []) => {
            queries.push({ sql: String(sql), values });
            if (/SELECT id, read/i.test(sql)) {
                return { rows: [{ id: 'mail-1', read: false, archived: false, in_inbox: true }] };
            }
            if (/UPDATE emails/i.test(sql)) {
                return { rows: [{ id: 'mail-1', read: false, archived: true, in_inbox: false }] };
            }
            return { rows: [] };
        },
        release() {}
    };
    __setMailboxStoreForTests({ pool: { connect: async () => client }, repository: {}, ready: true });

    const state = await updateMessageStateWithAudit(request, 'mail-1', 'archive');

    assert.deepEqual(state, { id: 'mail-1', read: false, archived: true, in_inbox: false });
    assert.equal(queries[0].sql, 'BEGIN');
    assert.match(queries[1].sql, /WHERE id = \$1\s+FOR UPDATE/i);
    assert.match(queries[2].sql, /archived = \$1/i);
    assert.match(queries[3].sql, /INSERT INTO integration_audit_events/i);
    assert.equal(queries[4].sql, 'COMMIT');
    assert.equal(queries.some(({ sql }) => /send|smtp|nodemailer/i.test(sql)), false);
});

test('a message outside the mailbox is not mutated and receives a not-found audit', async () => {
    const queries = [];
    const client = {
        query: async (sql, values = []) => {
            queries.push({ sql: String(sql), values });
            if (/SELECT id, read/i.test(sql)) return { rows: [] };
            return { rows: [] };
        },
        release() {}
    };
    __setMailboxStoreForTests({ pool: { connect: async () => client }, repository: {}, ready: true });

    const state = await updateMessageStateWithAudit(request, 'other-tenant-message', 'read');

    assert.equal(state, null);
    assert.equal(queries.some(({ sql }) => /UPDATE emails/i.test(sql)), false);
    const audit = queries.find(({ sql }) => /INSERT INTO integration_audit_events/i.test(sql));
    assert.equal(audit.values[5], 'other-tenant-message');
    assert.equal(audit.values[6], 404);
    assert.equal(queries.at(-1).sql, 'COMMIT');
});
