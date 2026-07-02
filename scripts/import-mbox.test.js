import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { importMbox } from './import-mbox.js';

test('imports mbox messages through the Postgres repository when available', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailshot-mbox-'));
    const mboxPath = path.join(tempDir, 'sent.mbox');
    fs.writeFileSync(mboxPath, [
        'From nobody Tue Jun 30 12:00:00 2026',
        'Message-ID: <sent-1@example.com>',
        'Date: Tue, 30 Jun 2026 12:00:00 +0000',
        'From: Paul <paul@tensology.com>',
        'To: User <user@example.com>',
        'Subject: Sent backup',
        'X-Gmail-Labels: Sent',
        '',
        'Hello from sent mail.'
    ].join('\n'));

    const upserts = [];
    const result = await importMbox(mboxPath, {
        postgresRepository: {
            list: async () => [],
            upsert: async (payload) => {
                upserts.push(payload);
                return payload;
            }
        },
        connectMongo: false,
        loadDiskCache: false
    });

    assert.equal(result.importedCount, 1);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].type, 'sent');
    assert.equal(upserts[0].messageId, '<sent-1@example.com>');
});
