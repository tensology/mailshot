import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    getArchiveToggleAction,
    getDeleteSelectionIds,
    hasActiveMailSelection,
    isDeleteKeyboardShortcut,
    buildReadTogglePayload,
    resolveSearchMailboxType,
    getEmailMailboxType,
    getSectionOnlySearchLabel
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

test('archive row action switches to unarchive in the archived mailbox', () => {
    assert.deepEqual(getArchiveToggleAction('inbox'), {
        archived: false,
        label: 'Archive',
        pastTense: 'archived'
    });

    assert.deepEqual(getArchiveToggleAction('archived'), {
        archived: true,
        label: 'Unarchive',
        pastTense: 'unarchived'
    });
});

test('read toggle payload keeps value and uses scope for select-all matching', () => {
    assert.deepEqual(buildReadTogglePayload({
        selectedEmails: ['a', 'b'],
        allMatchingSelected: false,
        value: true
    }), { ids: ['a', 'b'], value: true });

    assert.deepEqual(buildReadTogglePayload({
        selectedEmails: ['a'],
        allMatchingSelected: true,
        scope: { all: true, type: 'inbox' },
        value: false
    }), { scope: { all: true, type: 'inbox' }, value: false });
});

test('search defaults to everywhere and can narrow to the open section', () => {
    assert.equal(resolveSearchMailboxType({
        searchFilter: 'invoice',
        sectionOnly: false,
        activeTab: 'inbox'
    }), 'everywhere');
    assert.equal(resolveSearchMailboxType({
        searchFilter: 'invoice',
        sectionOnly: true,
        activeTab: 'sent'
    }), 'sent');
    assert.equal(resolveSearchMailboxType({
        searchFilter: 'invoice',
        sectionOnly: true,
        activeTab: 'bin'
    }), 'bin');
    assert.equal(resolveSearchMailboxType({
        searchFilter: '',
        sectionOnly: false,
        activeTab: 'starred'
    }), 'starred');
});

test('section-only search label follows the open mailbox name', () => {
    assert.equal(getSectionOnlySearchLabel('sent', { sent: 'Sent' }), 'Sent only');
    assert.equal(getSectionOnlySearchLabel('bin', { bin: 'Bin' }), 'Bin only');
    assert.equal(getSectionOnlySearchLabel('inbox', { inbox: 'Inbox' }), 'Inbox only');
});

test('email mailbox type follows bin/spam/archive before generic type', () => {
    assert.equal(getEmailMailboxType({ bin: true, type: 'inbox' }), 'bin');
    assert.equal(getEmailMailboxType({ spam: true, type: 'inbox' }), 'spam');
    assert.equal(getEmailMailboxType({ archived: true, type: 'inbox' }), 'archived');
    assert.equal(getEmailMailboxType({ type: 'sent' }), 'sent');
    assert.equal(getEmailMailboxType({ type: 'inbox' }), 'inbox');
});
