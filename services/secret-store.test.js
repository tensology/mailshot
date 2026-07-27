import assert from 'node:assert/strict';
import test from 'node:test';

import { canEncryptSecrets, decryptSecret, encryptSecret } from './secret-store.js';


test('Tensology service keys are encrypted at rest and can be restored', () => {
    const previous = process.env.MAILSHOT_SETTINGS_SECRET;
    process.env.MAILSHOT_SETTINGS_SECRET = 'unit-test-secret';
    try {
        assert.equal(canEncryptSecrets(), true);
        const encrypted = encryptSecret('tns_mailshot_example-key');
        assert.match(encrypted, /^enc:v1:/);
        assert.equal(encrypted.includes('example-key'), false);
        assert.equal(decryptSecret(encrypted), 'tns_mailshot_example-key');
    } finally {
        if (previous === undefined) delete process.env.MAILSHOT_SETTINGS_SECRET;
        else process.env.MAILSHOT_SETTINGS_SECRET = previous;
    }
});
