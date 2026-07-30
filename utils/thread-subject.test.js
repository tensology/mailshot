import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mergeThreadEmails,
    normalizeThreadSubject
} from './thread-subject.js';

test('normalizes common reply and forward prefixes', () => {
    assert.equal(normalizeThreadSubject('Fwd: Re: Project update'), 'project update');
});

test('mergeThreadEmails keeps the latest message first', () => {
    const thread = mergeThreadEmails(
        {
            _id: 'email-1',
            date: '2026-06-21T10:00:00.000Z'
        },
        [
            {
                _id: 'email-2',
                date: '2026-06-21T10:05:00.000Z'
            }
        ]
    );

    assert.deepEqual(thread.map((email) => email._id), ['email-2', 'email-1']);
});
