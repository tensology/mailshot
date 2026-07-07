import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isReadAloudReady,
    needsReadAloudPipeline,
    safePersistEmailReadAloudFields
} from './email-summary-service.js';

test('only queues inbox emails that still need summary and speech', () => {
    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        bin: false,
        spam: false
    }), true);

    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        read_aloud_status: 'ready'
    }), false);

    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        read_aloud_status: 'processing'
    }), true);

    assert.equal(needsReadAloudPipeline({
        type: 'sent',
        bin: false,
        spam: false
    }), false);
});

test('isReadAloudReady is true only when speech has been cached', () => {
    assert.equal(isReadAloudReady({ read_aloud_status: 'ready' }), true);
    assert.equal(isReadAloudReady({ read_summary_status: 'ready' }), false);
});

test('safe read-aloud persistence contains transient write failures', async (t) => {
    const originalError = console.error;
    const logs = [];
    t.after(() => {
        console.error = originalError;
    });
    console.error = (...args) => logs.push(args);

    const email = { _id: 'email-1', read_aloud_status: 'processing' };
    const persisted = await safePersistEmailReadAloudFields(
        email,
        { read_aloud_status: 'error' },
        async () => {
            throw new Error('Connection terminated unexpectedly');
        }
    );

    assert.equal(persisted._id, 'email-1');
    assert.equal(persisted.read_aloud_status, 'error');
    assert.equal(logs.length, 1);
    assert.match(String(logs[0][1]), /Connection terminated unexpectedly/);
});
