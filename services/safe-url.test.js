import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeExternalUrl } from './safe-url.js';

test('rejects non-https and localhost', async () => {
    await assert.rejects(() => assertSafeExternalUrl('http://example.com'), /HTTPS/);
    await assert.rejects(() => assertSafeExternalUrl('https://localhost/api'), /not allowed/);
    await assert.rejects(() => assertSafeExternalUrl('https://127.0.0.1/api'), /Private|blocked/i);
});

test('accepts public https host', async () => {
    const url = await assertSafeExternalUrl('https://www.tensology.com/');
    assert.equal(url, 'https://www.tensology.com');
});
