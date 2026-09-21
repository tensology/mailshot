import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    assertOutboundSendAllowed,
    checkRateLimit,
    clearRateLimitBuckets,
    countRecipients
} from './rate-limit.js';

test('countRecipients dedupes across to/cc/bcc', () => {
    assert.equal(countRecipients('a@b.com, A@b.com', 'c@d.com', 'a@b.com'), 2);
});

test('checkRateLimit blocks after limit', () => {
    clearRateLimitBuckets();
    const key = 'test-limit';
    assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).allowed, true);
    assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).allowed, true);
    assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).allowed, false);
});

test('assertOutboundSendAllowed enforces recipient cap', () => {
    clearRateLimitBuckets();
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@ex.com`).join(',');
    const result = assertOutboundSendAllowed({ actor: 't', to: many });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
});

test('assertOutboundSendAllowed allows normal send', () => {
    clearRateLimitBuckets();
    const result = assertOutboundSendAllowed({ actor: 'ok', to: 'a@b.com' });
    assert.equal(result.ok, true);
});
