import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    getDeleteSelectionIds,
    hasActiveMailSelection,
    isDeleteKeyboardShortcut
} from './mailActions.js';

test('all matching selection counts as an active mail selection', () => {
    assert.equal(hasActiveMailSelection({ selectedEmails: [], allMatchingSelected: true }), true);
    assert.equal(hasActiveMailSelection({ selectedEmails: ['one'], allMatchingSelected: false }), true);
    assert.equal(hasActiveMailSelection({ selectedEmails: [], allMatchingSelected: false }), false);
});

test('all matching selection uses the bulk scope instead of selected ids for delete', () => {
    assert.deepEqual(getDeleteSelectionIds({
        selectedEmails: [],
        deleteTargetIds: [],
        allMatchingSelected: true
    }), []);

    assert.deepEqual(getDeleteSelectionIds({
        selectedEmails: ['one', 'two'],
        deleteTargetIds: [],
        allMatchingSelected: false
    }), ['one', 'two']);

    assert.deepEqual(getDeleteSelectionIds({
        selectedEmails: ['one', 'two'],
        deleteTargetIds: ['thread-three'],
        allMatchingSelected: true
    }), ['thread-three']);
});

test('delete keyboard shortcut ignores editable targets', () => {
    assert.equal(isDeleteKeyboardShortcut({ key: 'Delete', target: { tagName: 'DIV' } }), true);
    assert.equal(isDeleteKeyboardShortcut({ key: 'Backspace', target: { tagName: 'DIV' } }), true);
    assert.equal(isDeleteKeyboardShortcut({ key: 'Delete', target: { tagName: 'INPUT' } }), false);
    assert.equal(isDeleteKeyboardShortcut({
        key: 'Delete',
        target: { tagName: 'DIV', isContentEditable: true }
    }), false);
});
