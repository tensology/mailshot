import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSummaryPrompt,
    isReadAloudReady,
    needsReadAloudPipeline,
    safePersistEmailReadAloudFields
} from './email-summary-service.js';

test('only queues inbox emails that still need a summary', () => {
    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        bin: false,
        spam: false
    }), true);

    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        read_aloud_status: 'ready'
    }), true);

    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        read_summary_status: 'ready',
        read_summary_model: '',
        read_aloud_status: 'processing'
    }), false);

    assert.equal(needsReadAloudPipeline({
        type: 'inbox',
        read_summary: 'Already summarized'
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
    assert.match(String(logs[0][0]), /summary\.persist\.failed/);
    assert.match(String(logs[0][0]), /Connection terminated unexpectedly/);
});

test('spoken explanation uses adaptive depth and retains important details beyond the old input cap', () => {
    const body = 'Project context. '.repeat(600) + 'Final decision: payment of R 42000 is due on 12 November.';
    const prompt = buildSummaryPrompt({ from: 'Project owner', subject: 'Detailed project decision', body });
    assert.ok(prompt.includes(body));
    assert.match(prompt, /no fixed sentence count or target playback duration/);
    assert.match(prompt, /each important topic/);
    assert.doesNotMatch(prompt, /2 to 4 short sentences/);
});
