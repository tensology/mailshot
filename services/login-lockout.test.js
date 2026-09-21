import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    clearLoginFailures,
    clearLoginLockouts,
    getLoginLockoutStatus,
    recordLoginFailure
} from './login-lockout.js';

test('locks out after repeated failures', () => {
    clearLoginLockouts();
    const username = 'paul';
    const ip = '1.2.3.4';
    for (let i = 0; i < 4; i += 1) {
        assert.equal(recordLoginFailure(username, ip).locked, false);
    }
    const locked = recordLoginFailure(username, ip);
    assert.equal(locked.locked, true);
    assert.equal(getLoginLockoutStatus(username, ip).locked, true);
    clearLoginFailures(username, ip);
    assert.equal(getLoginLockoutStatus(username, ip).locked, false);
});
