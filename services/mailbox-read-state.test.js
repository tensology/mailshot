import test from 'node:test';
import assert from 'node:assert/strict';

import { getMailboxIndexAvailability } from './mailbox-read-state.js';

test('marks mailbox index unavailable when database is disconnected', () => {
    assert.deepEqual(getMailboxIndexAvailability({
        dbConnected: false,
        dbQueryFailed: false
    }), {
        available: false,
        message: 'Mailbox index unavailable. Archived or deleted state may be stale until the database is restored.'
    });
});

test('marks mailbox index unavailable when database query fails', () => {
    assert.deepEqual(getMailboxIndexAvailability({
        dbConnected: true,
        dbQueryFailed: true
    }), {
        available: false,
        message: 'Mailbox index unavailable. Archived or deleted state may be stale until the database is restored.'
    });
});

test('marks mailbox index available only when database reads are healthy', () => {
    assert.deepEqual(getMailboxIndexAvailability({
        dbConnected: true,
        dbQueryFailed: false
    }), {
        available: true,
        message: ''
    });
});
