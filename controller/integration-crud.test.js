import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDeleteDraftHandler,
    createDeleteMessageHandler,
    createLabelsHandler,
    isDraftRecord,
    resolveSection
} from './integration-controller.js';

// No test here sends mail: every handler receives fake stores.
const passthrough = async (_request, _action, operation) => operation();
const fakeResponse = () => ({
    statusCode: 0, body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
});
const recorder = (calls, status = 200, data = { ok: true }) => async (request, response) => {
    calls.push(request.body);
    return response.status(status).json(data);
};

test('section aliases map to Mailshot folders', () => {
    assert.equal(resolveSection({ section: 'incoming' }), 'inbox');
    assert.equal(resolveSection({ folder: 'sent' }), 'sent');
    assert.equal(resolveSection({ section: 'trash' }), 'bin');
    assert.equal(resolveSection({}), 'inbox');
});

test('draft delete removes only the targeted draft id', async () => {
    const calls = [];
    const handler = createDeleteDraftHandler({ idempotent: passthrough, lookup: async (id) => ({ _id: id, type: 'drafts' }), remove: recorder(calls) });
    const response = fakeResponse();
    await handler({ params: { id: 'draft-7' }, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [{ ids: ['draft-7'] }]);
    assert.deepEqual(response.body.data, { id: 'draft-7', deleted: true });
});

test('draft delete refuses non-draft records', async () => {
    const calls = [];
    const handler = createDeleteDraftHandler({ idempotent: passthrough, lookup: async (id) => ({ _id: id, type: 'inbox' }), remove: recorder(calls) });
    const response = fakeResponse();
    await handler({ params: { id: 'mail-1' }, headers: {} }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(calls.length, 0);
});

test('draft delete returns 404 for unknown ids', async () => {
    const calls = [];
    const handler = createDeleteDraftHandler({ idempotent: passthrough, lookup: async () => null, remove: recorder(calls) });
    const response = fakeResponse();
    await handler({ params: { id: 'missing' }, headers: {} }, response);
    assert.equal(response.statusCode, 404);
    assert.equal(calls.length, 0);
});

test('message delete moves one message to bin by default', async () => {
    const binCalls = []; const removeCalls = [];
    const handler = createDeleteMessageHandler({ idempotent: passthrough, lookup: async (id) => ({ _id: id, bin: false }), toBin: recorder(binCalls, 201), remove: recorder(removeCalls) });
    const response = fakeResponse();
    await handler({ params: { id: 'mail-9' }, query: {}, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(binCalls, [{ ids: ['mail-9'] }]);
    assert.equal(removeCalls.length, 0);
});

test('permanent delete requires the message to already be in bin', async () => {
    const removeCalls = [];
    const handler = createDeleteMessageHandler({ idempotent: passthrough, lookup: async (id) => ({ _id: id, bin: false }), toBin: recorder([]), remove: recorder(removeCalls) });
    const response = fakeResponse();
    await handler({ params: { id: 'mail-9' }, query: { permanent: 'true' }, headers: {} }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(removeCalls.length, 0);

    const okHandler = createDeleteMessageHandler({ idempotent: passthrough, lookup: async (id) => ({ _id: id, bin: true }), toBin: recorder([]), remove: recorder(removeCalls) });
    const okResponse = fakeResponse();
    await okHandler({ params: { id: 'mail-9' }, query: { permanent: 'true' }, headers: {} }, okResponse);
    assert.equal(okResponse.statusCode, 200);
    assert.deepEqual(removeCalls, [{ ids: ['mail-9'] }]);
});

test('label update validates input and targets one message', async () => {
    const calls = [];
    const update = async (request, response) => { calls.push([request.params.id, request.body]); return response.status(200).json({ labels: request.body.labels }); };
    const handler = createLabelsHandler({ idempotent: passthrough, lookup: async (id) => ({ _id: id }), update });
    const bad = fakeResponse();
    await handler({ params: { id: 'mail-2' }, body: { labels: 'nope' }, headers: {} }, bad);
    assert.equal(bad.statusCode, 400);
    const ok = fakeResponse();
    await handler({ params: { id: 'mail-2' }, body: { labels: ['clients'] }, headers: {} }, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(calls, [['mail-2', { labels: ['clients'] }]]);
    assert.equal(isDraftRecord({ type: 'drafts' }), true);
});
