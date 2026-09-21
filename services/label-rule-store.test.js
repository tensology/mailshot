import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractEmailAddress,
    extractEmailDomain
} from './label-rule-store.js';

test('extractEmailAddress and extractEmailDomain', () => {
    assert.equal(extractEmailAddress('Ada <ada@example.com>'), 'ada@example.com');
    assert.equal(extractEmailDomain('Ada <ada@example.com>'), 'example.com');
    assert.equal(extractEmailDomain('nobody'), '');
});
