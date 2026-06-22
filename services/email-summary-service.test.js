import test from 'node:test';
import assert from 'node:assert/strict';

import { isReadAloudReady, needsReadAloudPipeline } from './email-summary-service.js';

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
    }), false);

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
