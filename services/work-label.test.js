import test from 'node:test';
import assert from 'node:assert/strict';

import { hasWorkLabel, workLabelArchiveUpdates } from './work-label.js';

test('adding work archives: archived true, in_inbox false, nothing else', () => {
    assert.deepEqual(workLabelArchiveUpdates(['clients'], ['clients', 'work'], {}), { archived: true, in_inbox: false });
    assert.deepEqual(workLabelArchiveUpdates([], ['Work'], {}), { archived: true, in_inbox: false });
    assert.deepEqual(workLabelArchiveUpdates(undefined, [' WORK '], {}), { archived: true, in_inbox: false });
});

test('other labels, removing work, or re-sending work do not touch archive state', () => {
    assert.deepEqual(workLabelArchiveUpdates([], ['clients'], {}), {});
    assert.deepEqual(workLabelArchiveUpdates(['work'], ['clients'], {}), {});
    assert.deepEqual(workLabelArchiveUpdates(['work'], ['work', 'clients'], {}), {});
    assert.deepEqual(workLabelArchiveUpdates(['work'], [], {}), {});
});

test('bin and spam mail is never resurrected by labelling', () => {
    assert.deepEqual(workLabelArchiveUpdates([], ['work'], { bin: true }), {});
    assert.deepEqual(workLabelArchiveUpdates([], ['work'], { spam: true }), {});
});

test('hasWorkLabel tolerates bad input', () => {
    assert.equal(hasWorkLabel(null), false);
    assert.equal(hasWorkLabel(['work']), true);
});
