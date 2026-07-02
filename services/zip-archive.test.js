import assert from 'node:assert/strict';
import test from 'node:test';

import { createZipArchive } from './zip-archive.js';

test('createZipArchive returns a valid zip container with file names', () => {
    const zip = createZipArchive([
        { filename: '../Payment.pdf', data: Buffer.from('pdf-data') },
        { filename: 'photo.png', data: Buffer.from('png-data') }
    ]);

    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    assert.match(zip.toString('latin1'), /1-Payment\.pdf/);
    assert.match(zip.toString('latin1'), /2-photo\.png/);
});
