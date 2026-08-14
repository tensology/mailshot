import assert from 'node:assert/strict';
import test from 'node:test';

import {
    appendComposeAttachments,
    describeComposeAttachments,
    removeComposeAttachmentAt
} from './composeAttachments.js';

const file = (name, size = 100, lastModified = 1) => ({ name, size, lastModified });

test('appendComposeAttachments appends dropped files without duplicating existing files', () => {
    const existing = [file('invoice.pdf')];
    const next = appendComposeAttachments(existing, [
        file('invoice.pdf'),
        file('photo.png', 200, 2)
    ]);

    assert.deepEqual(next.map((item) => item.name), ['invoice.pdf', 'photo.png']);
});

test('removeComposeAttachmentAt removes the requested attachment', () => {
    const next = removeComposeAttachmentAt([
        file('invoice.pdf'),
        file('photo.png')
    ], 0);

    assert.deepEqual(next.map((item) => item.name), ['photo.png']);
});

test('describeComposeAttachments explains files will be sent', () => {
    assert.equal(describeComposeAttachments([file('a.pdf')]), '1 attachment will be sent with this email');
    assert.equal(describeComposeAttachments([file('a.pdf'), file('b.png')]), '2 attachments will be sent with this email');
});
