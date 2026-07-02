import test from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'node:events';

import {
    attachImapErrorHandler,
    shouldRetryImapOnLocalhost,
    persistInboundMessage,
    deleteImportedMessages,
    buildFetchSequenceSet
} from './mail-sync.js';

test('retries localhost fallback for transient IMAP connection-swap failures', () => {
    const transientErrors = [
        { code: 'ENOTFOUND' },
        { code: 'EAI_AGAIN' },
        { code: 'ECONNRESET' },
        { message: 'Client network socket disconnected before secure TLS connection was established' },
        { message: 'Socket closed unexpectedly' }
    ];

    for (const error of transientErrors) {
        assert.equal(
            shouldRetryImapOnLocalhost(error, 'imap.example.com', '127.0.0.1'),
            true,
            `expected ${error.code || error.message} to retry the fallback host`
        );
    }
});

test('does not retry fallback host for auth failures or recursive fallback attempts', () => {
    assert.equal(
        shouldRetryImapOnLocalhost({ response: 'AUTHENTICATIONFAILED' }, 'imap.example.com', '127.0.0.1'),
        false
    );
    assert.equal(
        shouldRetryImapOnLocalhost({ code: 'ECONNRESET' }, '127.0.0.1', '127.0.0.1'),
        false
    );
});

test('attaches an IMAP error handler so transport errors do not go unhandled', () => {
    const client = new EventEmitter();
    const reported = [];

    const detach = attachImapErrorHandler(client, (message, error) => {
        reported.push({ message, error });
    });

    const error = Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' });
    client.emit('error', error);

    assert.equal(typeof detach, 'function');
    assert.equal(reported.length, 1);
    assert.equal(reported[0].message, 'Mailbox sync failed: Socket timeout');
    assert.equal(reported[0].error, error);

    detach();
    assert.equal(client.listenerCount('error'), 0);
});

test('persists inbound messages before deleting them from IMAP', async () => {
    const calls = [];
    const repository = {
        upsert: async (payload) => {
            calls.push({ type: 'upsert', payload });
            return payload;
        }
    };
    const client = {
        messageDelete: async (uid, options) => {
            calls.push({ type: 'delete', uid, options });
            return true;
        }
    };

    await persistInboundMessage({
        repository,
        client,
        uid: 77,
        payload: { messageId: '<msg-77>', subject: 'Hello' },
        deleteAfterImport: true
    });

    assert.deepEqual(calls, [
        {
            type: 'upsert',
            payload: { messageId: '<msg-77>', subject: 'Hello' }
        },
        {
            type: 'delete',
            uid: 77,
            options: { uid: true }
        }
    ]);
});

test('does not delete IMAP mail when delete-after-import is disabled', async () => {
    const calls = [];
    const repository = {
        upsert: async (payload) => {
            calls.push({ type: 'upsert', payload });
            return payload;
        }
    };
    const client = {
        messageDelete: async () => {
            calls.push({ type: 'delete' });
            return true;
        }
    };

    await persistInboundMessage({
        repository,
        client,
        uid: 88,
        payload: { messageId: '<msg-88>' },
        deleteAfterImport: false
    });

    assert.deepEqual(calls, [
        {
            type: 'upsert',
            payload: { messageId: '<msg-88>' }
        }
    ]);
});

test('deletes imported IMAP messages after ingestion completes', async () => {
    const calls = [];
    const client = {
        messageDelete: async (uids, options) => {
            calls.push({ uids, options });
            return true;
        }
    };

    await deleteImportedMessages(client, [7, 8, 9]);

    assert.deepEqual(calls, [
        {
            uids: [7, 8, 9],
            options: { uid: true }
        }
    ]);
});

test('builds a safe fetch sequence window from message counts', () => {
    assert.equal(buildFetchSequenceSet({ messages: 0 }), null);
    assert.equal(buildFetchSequenceSet({ messages: 5 }), '1:*');
    assert.equal(buildFetchSequenceSet({ messages: 450 }), '251:*');
});
