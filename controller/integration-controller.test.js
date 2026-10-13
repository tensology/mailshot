import test from 'node:test';
import assert from 'node:assert/strict';

import {
    __integrationSerializersForTests,
    createMessageStateHandler
} from './integration-controller.js';
import {
    hasMailStateScope,
    requireMailStateScope
} from '../services/tensology-service-auth.js';

const { compactMessageList } = __integrationSerializersForTests;

test('integration mail lists return compact summaries without message bodies', () => {
    const hugeBody = `<p>${'private message '.repeat(1000)}</p>`;
    const result = compactMessageList({
        status: 200,
        data: {
            emails: [{
                _id: 42,
                subject: 'A useful subject',
                from: 'client@example.com',
                body: hugeBody,
                body_html: hugeBody,
                attachments: [{ filename: 'brief.pdf', contentType: 'application/pdf', size: 1234, content: 'binary' }]
            }],
            total: 1,
            page: 1,
            limit: 50
        }
    });

    const message = result.data.emails[0];
    assert.equal(message.subject, 'A useful subject');
    assert.equal(message.preview.length, 500);
    assert.equal(message.body, undefined);
    assert.equal(message.body_html, undefined);
    assert.equal(message.attachments[0].content, undefined);
    assert.deepEqual(result.data.total, 1);
});

test('integration mail list leaves upstream errors untouched', () => {
    const result = { status: 503, data: 'Mailbox is unavailable' };
    assert.equal(compactMessageList(result), result);
});

const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
});

const createMemoryIdempotency = () => {
    const records = new Map();
    return async (request, action, operation) => {
        const key = `${action}:${request.headers['idempotency-key']}`;
        if (records.has(key)) return { ...records.get(key), replay: true };
        const result = await operation();
        records.set(key, result);
        return result;
    };
};

test('message state authorization is limited to the Mailshot mailbox tenant', () => {
    assert.equal(hasMailStateScope({ audience: 'mailshot', scopes: ['mail.service'] }), true);
    assert.equal(hasMailStateScope({ audience: 'decisionsai', scopes: ['mail.read'] }), false);
    assert.equal(hasMailStateScope({ audience: 'decisionsai', scopes: ['mail.state.write'] }), false);
    assert.equal(hasMailStateScope({ audience: 'other', scopes: ['mail.service', 'mail.state.write'] }), false);

    const response = createResponse();
    let continued = false;
    requireMailStateScope(
        { tensologyService: { audience: 'decisionsai', scopes: ['mail.read'] } },
        response,
        () => { continued = true; }
    );
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error.code, 'insufficient_scope');
    assert.equal(continued, false);
});

test('message state endpoint scopes the mutation to the exact requested message and sends no mail', async () => {
    const calls = [];
    let outboundSendCount = 0;
    const handler = createMessageStateHandler({
        idempotent: createMemoryIdempotency(),
        updateState: async (_request, messageId, action) => {
            calls.push({ messageId, action });
            return { id: messageId, read: true, archived: false, in_inbox: true };
        },
        recordAudit: async () => {}
    });
    const response = createResponse();

    await handler({
        params: { id: 'mail-tenant-message-7' },
        body: { action: 'read' },
        headers: { 'idempotency-key': 'state-1' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.id, 'mail-tenant-message-7');
    assert.deepEqual(calls, [{ messageId: 'mail-tenant-message-7', action: 'read' }]);
    assert.equal(outboundSendCount, 0);
});

test('message state endpoint supports read, unread, archive, and unarchive', async () => {
    const observed = [];
    const handler = createMessageStateHandler({
        idempotent: async (_request, _key, operation) => operation(),
        updateState: async (_request, messageId, action) => {
            observed.push(action);
            return {
                id: messageId,
                read: action === 'read',
                archived: action === 'archive',
                in_inbox: action !== 'archive'
            };
        },
        recordAudit: async () => {}
    });

    for (const action of ['read', 'unread', 'archive', 'unarchive']) {
        const response = createResponse();
        await handler({
            params: { id: 'mail-1' }, body: { action }, headers: { 'idempotency-key': `state-${action}` }
        }, response);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.data.action, action);
    }
    assert.deepEqual(observed, ['read', 'unread', 'archive', 'unarchive']);
});

test('message state endpoint replays idempotently without repeating the mutation', async () => {
    let mutations = 0;
    const handler = createMessageStateHandler({
        idempotent: createMemoryIdempotency(),
        updateState: async () => {
            mutations += 1;
            return { id: 'mail-1', read: false, archived: true, in_inbox: false };
        },
        recordAudit: async () => {}
    });
    const request = {
        params: { id: 'mail-1' }, body: { action: 'archive' }, headers: { 'idempotency-key': 'same-key' }
    };
    const first = createResponse();
    const second = createResponse();

    await handler(request, first);
    await handler(request, second);

    assert.equal(mutations, 1);
    assert.equal(first.body.meta.idempotent_replay, false);
    assert.equal(second.body.meta.idempotent_replay, true);
});

test('message state endpoint rejects invalid actions and audits the attempt', async () => {
    const audits = [];
    let mutated = false;
    const handler = createMessageStateHandler({
        updateState: async () => { mutated = true; },
        recordAudit: async (...args) => { audits.push(args); }
    });
    const response = createResponse();

    await handler({ params: { id: 'mail-1' }, body: { action: 'delete' }, headers: {} }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'invalid_action');
    assert.equal(mutated, false);
    assert.equal(audits[0][1], 'mail.message.state.invalid');
    assert.equal(audits[0][2], 'mail-1');
});

test('message state endpoint returns not found when the authoritative mailbox lacks the message', async () => {
    const handler = createMessageStateHandler({
        idempotent: async (_request, _key, operation) => operation(),
        updateState: async () => null,
        recordAudit: async () => {}
    });
    const response = createResponse();

    await handler({
        params: { id: 'outside-mailbox' }, body: { action: 'read' }, headers: { 'idempotency-key': 'missing' }
    }, response);

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error.code, 'not_found');
});
