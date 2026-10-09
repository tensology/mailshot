import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applySignatureHtml,
    htmlToPlainText,
    normalizeSignatureHtml,
    normalizeSignatureOptions
} from './signatureComposer.js';

test('normalizes signatures without stripping image html', () => {
    const signatures = normalizeSignatureOptions({
        signatures: [{
            email: 'Paul@Tensology.com',
            signature_html: '<p>Paul</p><img src="https://example.com/signature.png" alt="">'
        }]
    });

    assert.equal(signatures.length, 1);
    assert.equal(signatures[0].email, 'paul@tensology.com');
    assert.match(signatures[0].html, /<img src="https:\/\/example\.com\/signature\.png"/);
    assert.equal(signatures[0].text, 'Paul');
});

test('applies signature html while preserving image markup and plain-text fallback', () => {
    const signature = '<p>Paul</p><img src="https://example.com/signature.png" alt="">';
    const html = applySignatureHtml('<p>Hello</p>', signature);

    assert.equal(html, '<p>Hello</p><br><p>Paul</p><img src="https://example.com/signature.png" alt="">');
    assert.equal(htmlToPlainText(html), 'Hello\nPaul');
});

test('adds breathing room before an empty-body signature', () => {
    const signature = '<img src="https://example.com/signature.png" alt="">';
    assert.equal(applySignatureHtml('', signature), '<br><br><img src="https://example.com/signature.png" alt="">');
});

test('collapses duplicate trailing signatures to exactly one copy', () => {
    const signature = '<p>Paul</p><img src="https://example.com/signature.png" alt="">';
    const duplicated = `<p>Hello</p><br>${signature}<br>${signature}`;
    const html = applySignatureHtml(duplicated, signature);

    assert.equal(html, `<p>Hello</p><br>${signature}`);
    assert.equal(htmlToPlainText(html), 'Hello\nPaul');
});

test('inserts and replaces a signature before quoted reply html', () => {
    const first = '<p>Paul</p>';
    const second = '<p>Paul H</p>';
    const quoted = '<blockquote data-mailshot-quoted="true"><table><tbody><tr><td>Original</td></tr></tbody></table></blockquote>';
    const signed = applySignatureHtml(`<div><br></div>${quoted}`, first);

    assert.equal(signed, `<div><br></div><br>${first}${quoted}`);
    assert.equal(applySignatureHtml(signed, second, first), `<div><br></div><br>${second}${quoted}`);
});

test('normalizes signature images to a responsive 460px width', () => {
    assert.equal(
        normalizeSignatureHtml('<img src="x" style="max-width:240px;width:100%;height:auto;display:block;">'),
        '<img src="x" style="width:460px;max-width:100%;height:auto;display:block;">'
    );
    assert.equal(
        normalizeSignatureHtml('<img src="x">'),
        '<img src="x" style="width:460px;max-width:100%;height:auto;display:block;">'
    );
});
