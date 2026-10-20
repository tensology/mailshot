import test from 'node:test';
import assert from 'node:assert/strict';

import { MORE_SIDEBAR, PRIMARY_SIDEBAR, SIDEBAR_DATA } from './sidebar.config.js';

test('keeps primary mailboxes visible and removes Snoozed from the sidebar', () => {
    assert.deepEqual(
        PRIMARY_SIDEBAR.map((item) => item.name),
        ['inbox', 'starred', 'sent', 'drafts', 'allmail', 'archived']
    );
    assert.equal(SIDEBAR_DATA.some((item) => item.name === 'snoozed'), false);
});

test('places secondary mailboxes behind the Show more control', () => {
    assert.deepEqual(MORE_SIDEBAR.map((item) => item.name), ['bin', 'spam']);
    assert.deepEqual(SIDEBAR_DATA, [...PRIMARY_SIDEBAR, ...MORE_SIDEBAR]);
});
