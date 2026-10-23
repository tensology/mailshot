import test from 'node:test';
import assert from 'node:assert/strict';

import { createSaveDraftHandler } from './integration-controller.js';
import { draftOnlySenderBlock } from './email-controller.js';
import { DRAFT_ATTACHMENT_LIMITS, parseDraftAttachments } from '../services/draft-attachments.js';

// No test here sends mail: the draft save handler is replaced with a recorder.
const passthrough = async (_request, _action, operation) => operation();
const fakeResponse = () => ({
    statusCode: 0, body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
});
const identities = () => [
    { email: 'paul@tensology.com', name: '', primary: true, can_send: true },
    { email: 'all@tensology.co.za', name: 'Tensology', primary: false, can_send: false }
];
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 1)]);

const saveWith = (calls) => async (request, response) => {
    calls.push({ body: request.body, files: request.files });
    return response.status(200).json({ _id: 'draft-1', from: request.body.from, attachments: (request.files || []).map((f) => ({ filename: f.originalname })) });
};

test('draft create stores base64 attachments as uploaded files and keeps the configured From', async () => {
    const calls = [];
    const handler = createSaveDraftHandler({ idempotent: passthrough, save: saveWith(calls), identities });
    const response = fakeResponse();
    await handler({ params: {}, headers: {}, body: {
        to: ['roland@example.com', 'simon@example.com'], subject: 'S', text: 'Body', from: 'all@tensology.co.za',
        attachments: [{ filename: 'auth.pdf', content_type: 'application/pdf', content: pdf.toString('base64') }]
    } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.from, '"Tensology" <all@tensology.co.za>');
    assert.equal(calls[0].body.to, 'roland@example.com, simon@example.com');
    assert.equal(calls[0].body.attachments, undefined);
    assert.equal(calls[0].files[0].originalname, 'auth.pdf');
    assert.equal(calls[0].files[0].mimetype, 'application/pdf');
    assert.deepEqual(calls[0].files[0].buffer, pdf);
});

test('unknown From is rejected before anything is saved', async () => {
    const calls = [];
    const handler = createSaveDraftHandler({ idempotent: passthrough, save: saveWith(calls), identities });
    const response = fakeResponse();
    await handler({ params: {}, headers: {}, body: { to: 'x@example.com', from: 'ceo@evil.example' } }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'invalid_sender');
    assert.equal(calls.length, 0);
});

test('invalid attachments are rejected with 400 and nothing is saved', async () => {
    const cases = [
        [{ filename: 'run.exe', content_type: 'application/x-msdownload', content: 'TVqQ' }, /unsupported type/],
        [{ filename: 'fake.pdf', content_type: 'application/pdf', content: Buffer.from('hello').toString('base64') }, /does not look like/],
        [{ filename: 'a.pdf', content_type: 'application/pdf', content: '***' }, /not valid base64/],
        [{ filename: 'a.png', content_type: 'application/pdf', content: pdf.toString('base64') }, /extension does not match/],
        [{ content_type: 'application/pdf', content: pdf.toString('base64') }, /needs a filename/]
    ];
    for (const [attachment, pattern] of cases) {
        const calls = [];
        const handler = createSaveDraftHandler({ idempotent: passthrough, save: saveWith(calls), identities });
        const response = fakeResponse();
        await handler({ params: {}, headers: {}, body: { to: 'x@example.com', attachments: [attachment] } }, response);
        assert.equal(response.statusCode, 400, String(pattern));
        assert.equal(response.body.error.code, 'invalid_attachment');
        assert.match(response.body.error.message, pattern);
        assert.equal(calls.length, 0);
    }
});

test('size and count limits are enforced', () => {
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(DRAFT_ATTACHMENT_LIMITS.maxFileBytes)]).toString('base64');
    assert.throws(() => parseDraftAttachments([{ filename: 'big.pdf', content: big }]), /exceeds/);
    const many = Array.from({ length: DRAFT_ATTACHMENT_LIMITS.maxFiles + 1 }, (_, i) => ({ filename: `f${i}.txt`, content: 'aGk=' }));
    assert.throws(() => parseDraftAttachments(many), /At most/);
    assert.throws(() => parseDraftAttachments('nope'), /must be a list/);
});

test('filenames are reduced to a safe base name and type falls back to the extension', () => {
    const [file] = parseDraftAttachments([{ filename: '../../etc/invoice.pdf', content: pdf.toString('base64') }]);
    assert.equal(file.originalname, 'invoice.pdf');
    assert.equal(file.mimetype, 'application/pdf');
});

test('drafts from a draft-only identity cannot be sent from the SMTP mailbox', () => {
    assert.match(draftOnlySenderBlock({ from: '"Tensology" <all@tensology.co.za>' }, identities()), /cannot send from/);
    assert.equal(draftOnlySenderBlock({ from: 'Paul@Tensology.com' }, identities()), '');
    assert.equal(draftOnlySenderBlock(null, identities()), '');
});
