import test from 'node:test';
import assert from 'node:assert/strict';
import { applySignatureToParts, createSignatureApplier, resolveSignature } from '../services/integration-signature.js';
import { createSaveDraftHandler, createSendMessageHandler } from './integration-controller.js';

const SIG = '<p>Paul Hoft<br>Tensology</p>';
const general = { selected_email: 'paul@tensology.com', signatures: [
    { email: 'paul@tensology.com', signature_html: SIG },
    { email: 'empty@tensology.com', signature_html: '' }
] };
const applier = createSignatureApplier({ loadSettings: async () => ({ general }) });
const res = () => { const r = { status(s) { r.code = s; return r; }, json(d) { r.body = d; return r; } }; return r; };
const passIdem = async (_req, _key, fn) => fn();
const capture = () => { const calls = []; return { calls, fn: async (req, response) => { calls.push(req.body); response.status(200).json({ ok: true }); } }; };

test('resolveSignature: exact sender, default when no from, none for unsigned sender', () => {
    assert.ok(resolveSignature(general, 'Paul <paul@tensology.com>').html.includes('Paul Hoft'));
    assert.ok(resolveSignature(general, '').html.includes('Tensology'));
    assert.equal(resolveSignature(general, 'empty@tensology.com'), null);
    assert.equal(resolveSignature(general, 'other@x.com'), null);
});

test('appends to html and text, idempotent on repeat', () => {
    const sig = resolveSignature(general);
    const once = applySignatureToParts({ text: 'Hi', html: '<p>Hi</p>' }, sig);
    assert.ok(once.html.startsWith('<p>Hi</p><br><p>Paul Hoft'));
    assert.equal(once.text, 'Hi\n\nPaul Hoft\nTensology');
    assert.deepEqual(applySignatureToParts(once, sig), once);
});

test('html signature placed before quoted block; html-only body leaves text empty', () => {
    const out = applySignatureToParts({ text: '', html: '<p>Hi</p><blockquote data-mailshot-quoted="true">old</blockquote>' }, resolveSignature(general));
    assert.match(out.html, /Tensology<\/p><blockquote/);
    assert.equal(out.text, '');
});

test('opt-out flag and unsigned sender do nothing', async () => {
    assert.deepEqual(await applier({ signature: false }, { text: 'a', html: '' }), { text: 'a', html: '' });
    assert.deepEqual(await applier({ from: 'empty@tensology.com' }, { text: 'a', html: '' }), { text: 'a', html: '' });
});

test('draft create appends; draft update does not', async () => {
    const save = capture();
    const h = createSaveDraftHandler({ idempotent: passIdem, save: save.fn, identities: () => [], signature: applier });
    await h({ body: { to: 'a@b.c', html: '<p>Hi</p>', text: 'Hi' }, params: {} }, res());
    assert.ok(save.calls[0].body_html.includes('Paul Hoft'));
    assert.ok(save.calls[0].body.includes('Paul Hoft'));
    await h({ body: { to: 'a@b.c', html: '<p>Hi</p>' }, params: { id: 'd1' } }, res());
    assert.equal(save.calls[1].body_html, '<p>Hi</p>');
    await h({ body: { html: '<p>Hi</p>', signature: false }, params: {} }, res());
    assert.equal(save.calls[2].body_html, '<p>Hi</p>');
    assert.equal(save.calls[2].signature, undefined);
});

test('send appends once; send of draft already signed is unchanged', async () => {
    const send = capture();
    const h = createSendMessageHandler({ idempotent: passIdem, send: send.fn, signature: applier });
    await h({ body: { to: 'a@b.c', html: '<p>Hi</p>' } }, res());
    assert.equal((send.calls[0].html.match(/Paul Hoft/g) || []).length, 1);
    const signed = send.calls[0].html;
    await h({ body: { to: 'a@b.c', draftId: 'd1', html: signed } }, res());
    assert.equal(send.calls[1].html, signed);
    await h({ body: { to: 'a@b.c', draftId: 'd1' } }, res());
    assert.equal(send.calls[2].html, '');
});
