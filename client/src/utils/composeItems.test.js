import test from 'node:test';
import assert from 'node:assert/strict';

import { draftKey, upsertDraftComposer } from './composeItems.js';

let seq = 0;
const createItem = (draft) => ({ id: `c${++seq}`, composeState: 'normal', draft: { ...draft } });

test('opening a new draft adds one composer', () => {
    const items = upsertDraftComposer([], { _id: 'd1', subject: 'Invoice' }, createItem);
    assert.equal(items.length, 1);
    assert.equal(items[0].draft._id, 'd1');
});

test('opening an already-open draft restores it instead of duplicating', () => {
    let items = upsertDraftComposer([], { _id: 'd1' }, createItem);
    items = upsertDraftComposer(items, { _id: 'd2' }, createItem);
    items = items.map((item) => (item.draft._id === 'd1' ? { ...item, composeState: 'minimized' } : item));
    const firstId = items.find((item) => item.draft._id === 'd1').id;

    items = upsertDraftComposer(items, { _id: 'd1' }, createItem);

    assert.equal(items.filter((item) => item.draft._id === 'd1').length, 1);
    const restored = items[items.length - 1];
    assert.equal(restored.id, firstId);
    assert.equal(restored.composeState, 'normal');
    assert.equal(items.length, 2);
});

test('fast double-click (two queued updates) yields a single composer', () => {
    const draft = { _id: 42 };
    const updates = [
        (current) => upsertDraftComposer(current, draft, createItem),
        (current) => upsertDraftComposer(current, { _id: '42' }, createItem)
    ];
    const items = updates.reduce((state, update) => update(state), []);
    assert.equal(items.length, 1);
});

test('drafts without an id (new messages) are never merged', () => {
    let items = upsertDraftComposer([], {}, createItem);
    items = upsertDraftComposer(items, { _id: '' }, createItem);
    assert.equal(items.length, 2);
    assert.equal(draftKey({}), null);
});

test('an expanded composer keeps its state when re-opened', () => {
    let items = [{ id: 'x', composeState: 'expanded', draft: { _id: 'd9' } }];
    items = upsertDraftComposer(items, { _id: 'd9' }, createItem);
    assert.equal(items.length, 1);
    assert.equal(items[0].composeState, 'expanded');
});
