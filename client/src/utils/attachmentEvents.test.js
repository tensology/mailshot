import assert from 'node:assert/strict';
import test from 'node:test';

import {
    filesFromAttachmentEvent,
    appendUniqueFiles,
    fileIdentity,
    isFileDropEvent,
    reconcileAttachmentSave,
    resolveCapturedAttachmentIntent
} from './attachmentEvents.js';

const pdf = { name: 'notice.pdf', size: 42, type: 'application/pdf' };
const image = { name: 'evidence.png', size: 84 };

test('reads every selected file from a file input change event', () => {
    const event = { target: { files: { 0: pdf, 1: image, length: 2 } } };

    assert.deepEqual(filesFromAttachmentEvent(event), [pdf, image]);
});

test('reads every dropped file from a drag event', () => {
    const event = { dataTransfer: { files: { 0: image, length: 1 }, types: ['Files'] } };

    assert.deepEqual(filesFromAttachmentEvent(event), [image]);
});

test('returns no attachments when an event contains no files', () => {
    assert.deepEqual(filesFromAttachmentEvent({}), []);
});

test('does not treat dropped text or URLs as file attachments', () => {
    const event = {
        dataTransfer: {
            files: { 0: image, length: 1 },
            types: ['text/plain', 'text/uri-list']
        }
    };

    assert.equal(isFileDropEvent(event), false);
    assert.deepEqual(filesFromAttachmentEvent(event), []);
});

test('deduplicates identical incoming files using a stable identity', () => {
    const duplicate = { ...pdf };

    assert.deepEqual(appendUniqueFiles([pdf], [duplicate, image]), [pdf, image]);
    assert.equal(fileIdentity(pdf), fileIdentity(duplicate));
});

test('deduplicates an incoming file already promoted to a saved attachment', () => {
    const savedPdf = { attachment_id: 'pdf', filename: pdf.name, size: pdf.size };

    assert.deepEqual(appendUniqueFiles([], [pdf, image], [savedPdf]), [image]);
});

test('removes only successfully saved files captured by the completed request', () => {
    const addedWhileSaving = { name: 'later.txt', size: 21 };
    const returnedPdf = { attachment_id: 'pdf', filename: pdf.name, size: pdf.size };

    assert.deepEqual(
        reconcileAttachmentSave({
            currentSaved: [],
            currentPending: [pdf, addedWhileSaving],
            requestedSaved: [],
            requestedPending: [pdf],
            returnedSaved: [returnedPdf]
        }),
        { saved: [returnedPdf], pending: [addedWhileSaving] }
    );
});

test('preserves pending and saved attachment removals made while saving', () => {
    const first = { attachment_id: 'first', filename: 'first.pdf', size: 42 };
    const second = { attachment_id: 'second', filename: 'second.png', size: 84 };

    assert.deepEqual(
        reconcileAttachmentSave({
            currentSaved: [second],
            currentPending: [],
            requestedSaved: [first, second],
            requestedPending: [pdf],
            returnedSaved: [first, second, { attachment_id: 'pdf', filename: pdf.name, size: pdf.size }]
        }),
        { saved: [second], pending: [] }
    );
});

test('rebases close-time attachment intent after the active save uploads a pending file', () => {
    const uploadedPdf = { attachment_id: 'pdf', filename: pdf.name, size: pdf.size };

    assert.deepEqual(resolveCapturedAttachmentIntent({
        currentSaved: [uploadedPdf],
        currentPending: [],
        capturedSaved: [],
        capturedPending: [pdf]
    }), {
        saved: [uploadedPdf],
        pending: []
    });
});
