import test from 'node:test';
import assert from 'node:assert/strict';

import {
    downloadAttachment,
    isSafeAttachmentPreviewType,
    loadAttachmentPreview
} from './downloadAttachment.js';

test('downloads an authenticated blob with the requested filename and revokes its URL', async () => {
    const calls = [];
    const link = {
        click: () => calls.push('click'),
        remove: () => calls.push('remove')
    };
    const documentObject = {
        body: { appendChild: (value) => calls.push(['append', value]) },
        createElement: (tagName) => {
            assert.equal(tagName, 'a');
            return link;
        }
    };
    const urlObject = {
        createObjectURL: (blob) => {
            calls.push(['create', blob]);
            return 'blob:authenticated';
        },
        revokeObjectURL: (url) => calls.push(['revoke', url])
    };
    const blob = { type: 'application/pdf' };
    const call = async (payload, path, options) => {
        calls.push(['request', payload, path, options]);
        return { data: blob, error: '' };
    };

    const result = await downloadAttachment({
        call,
        path: 'message-id/attachments/attachment-id',
        filename: 'notice.pdf',
        documentObject,
        urlObject
    });

    assert.equal(result.error, '');
    assert.equal(link.href, 'blob:authenticated');
    assert.equal(link.download, 'notice.pdf');
    assert.deepEqual(calls, [
        ['request', {}, 'message-id/attachments/attachment-id', { silent: true }],
        ['create', blob],
        ['append', link],
        'click',
        'remove',
        ['revoke', 'blob:authenticated']
    ]);
});

test('does not create a browser download when the authenticated request fails', async () => {
    const result = await downloadAttachment({
        call: async () => ({ data: null, error: 'Unauthorized' }),
        path: 'message-id/attachments/attachment-id',
        filename: 'notice.pdf',
        documentObject: { createElement: () => assert.fail('should not create a link') },
        urlObject: { createObjectURL: () => assert.fail('should not create an object URL') }
    });

    assert.equal(result.error, 'Unauthorized');
});

test('allows passive preview types and rejects active attachment content', () => {
    assert.equal(isSafeAttachmentPreviewType('application/pdf'), true);
    assert.equal(isSafeAttachmentPreviewType('image/png; charset=binary'), true);
    assert.equal(isSafeAttachmentPreviewType('image/svg+xml'), false);
    assert.equal(isSafeAttachmentPreviewType('text/html'), false);
});

test('loads safe previews through the authenticated request and rejects unsafe blobs', async () => {
    const created = [];
    const urlObject = {
        createObjectURL(blob) {
            created.push(blob.type);
            return 'blob:safe-preview';
        }
    };
    const safe = await loadAttachmentPreview({
        call: async () => ({ data: new Blob(['pdf'], { type: 'application/pdf' }), error: null }),
        path: 'mail/attachments/pdf',
        urlObject
    });
    const unsafe = await loadAttachmentPreview({
        call: async () => ({ data: new Blob(['html'], { type: 'text/html' }), error: null }),
        path: 'mail/attachments/html',
        urlObject
    });

    assert.deepEqual(safe, { data: 'blob:safe-preview', error: null });
    assert.match(unsafe.error, /cannot be previewed safely/i);
    assert.deepEqual(created, ['application/pdf']);
});
