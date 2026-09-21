import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test } from 'node:test';
import {
    ATTACHMENTS_DIR,
    buildContentDisposition,
    readAttachmentFile,
    sanitizeContentDispositionFilename
} from './attachments.js';

test('sanitizes Content-Disposition filenames', () => {
    assert.equal(sanitizeContentDispositionFilename('evil\r\n".pdf'), 'evil___.pdf');
    assert.match(buildContentDisposition('attachment', 'report.pdf'), /filename="report.pdf"/);
    assert.match(buildContentDisposition('inline', 'café.pdf'), /filename\*=UTF-8''/);
});

test('readAttachmentFile refuses paths outside attachments jail', () => {
    const outside = path.join(os.tmpdir(), `mailshot-outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'secret');
    try {
        assert.equal(readAttachmentFile(outside), null);
        assert.equal(readAttachmentFile(path.join(ATTACHMENTS_DIR, '..', 'attachments', '..', 'package.json')), null);
    } finally {
        fs.unlinkSync(outside);
    }
});
