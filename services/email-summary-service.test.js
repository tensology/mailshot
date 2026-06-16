import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPrefetchEmailSummary } from './email-summary-service.js';

test('only prefetches inbox emails without an existing summary', () => {
    assert.equal(shouldPrefetchEmailSummary({
        type: 'inbox',
        bin: false,
        spam: false
    }), true);

    assert.equal(shouldPrefetchEmailSummary({
        type: 'inbox',
        read_summary_status: 'ready'
    }), false);

    assert.equal(shouldPrefetchEmailSummary({
        type: 'sent',
        bin: false,
        spam: false
    }), false);
});
