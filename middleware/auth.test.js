import test from 'node:test';
import assert from 'node:assert/strict';

import { requireAuth } from './auth.js';

test('browser navigation headers do not bypass authentication on protected routes', () => {
    let nextCalled = false;
    let statusCode = 0;
    const request = {
        method: 'GET',
        headers: {
            authorization: '',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document'
        },
        query: {},
        get: (name) => name.toLowerCase() === 'accept' ? 'text/html' : ''
    };
    const response = {
        status(code) {
            statusCode = code;
            return this;
        },
        json() {
            return this;
        }
    };

    requireAuth(request, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.ok([401, 503].includes(statusCode), `expected auth rejection, received ${statusCode}`);
});
