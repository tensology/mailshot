import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertCachedEmail, getCachedEmailById } from '../services/mail-sync.js';
import { updateEmailLabels } from './label-controller.js';

const fakeResponse = () => ({
    statusCode: 0, body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
});
const seed = (id, extra = {}) => upsertCachedEmail({ _id: id, subject: 'x', from: 'a@b.test', labels: [], archived: false, in_inbox: true, ...extra });
const tag = async (id, labels) => { const res = fakeResponse(); await updateEmailLabels({ params: { id }, body: { labels } }, res); return res; };

test('PUT labels with work archives the message and keeps it out of the inbox', async () => {
    seed('work-archive-1');
    const res = await tag('work-archive-1', ['work']);
    assert.equal(res.statusCode, 200);
    const stored = getCachedEmailById('work-archive-1');
    assert.equal(stored.archived, true);
    assert.equal(stored.in_inbox, false);
    assert.deepEqual(stored.labels, ['work']);
    assert.notEqual(stored.bin, true);
});

test('removing the work label does not un-archive', async () => {
    seed('work-archive-2');
    await tag('work-archive-2', ['work']);
    await tag('work-archive-2', []);
    const stored = getCachedEmailById('work-archive-2');
    assert.deepEqual(stored.labels, []);
    assert.equal(stored.archived, true);
    assert.equal(stored.in_inbox, false);
});

test('other labels leave the message in the inbox', async () => {
    seed('work-archive-3');
    await tag('work-archive-3', ['clients']);
    const stored = getCachedEmailById('work-archive-3');
    assert.equal(stored.archived, false);
    assert.equal(stored.in_inbox, true);
});
