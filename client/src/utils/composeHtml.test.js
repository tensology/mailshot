import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { sanitizeComposeHtml } = await import('./composeHtml.js');
const { buildReplyHtml, buildForwardHtml } = await import('./recipients.js');
const { htmlToPlainText, applySignatureHtml } = await import('./signatureComposer.js');

test('preserves safe table markup and removes unsafe content', () => {
    const result = sanitizeComposeHtml('<table><tbody><tr><th>Invoice</th><td style="text-align:right">R 100</td></tr></tbody></table><script>alert(1)</script>');

    assert.match(result, /<table>/);
    assert.match(result, /<th>Invoice<\/th>/);
    assert.match(result, /<td style="text-align:right">R 100<\/td>/);
    assert.doesNotMatch(result, /script|alert/);
});

test('preserves ordered and unordered lists from rich clipboard content', () => {
    const result = sanitizeComposeHtml('<ul><li>First item</li><li><strong>Second item</strong></li></ul><ol><li>Third item</li></ol>');

    assert.match(result, /<ul><li>First item<\/li><li><strong>Second item<\/strong><\/li><\/ul>/);
    assert.match(result, /<ol><li>Third item<\/li><\/ol>/);
});

test('preserves quoted rich email markup and removes scripts', () => {
    const result = sanitizeComposeHtml('<blockquote data-mailshot-quoted="true" style="color:#123"><table><tbody><tr><td><img src="https://example.com/logo.png"></td></tr></tbody></table><script>alert(1)</script></blockquote>');

    assert.match(result, /<blockquote data-mailshot-quoted="true" style="color:#123">/);
    assert.match(result, /<table>/);
    assert.match(result, /<img src="https:\/\/example\.com\/logo\.png">/);
    assert.doesNotMatch(result, /script|alert/);
});

test('editing and saving a reply or forward preserves styles, headings, images and tables', () => {
    const email = { from: 'sender@example.com', to: 'recipient@example.com', subject: 'Styled mail', date: '2026-10-27T08:00:00Z', body_html: '<head><style>@media(max-width:600px){table{width:100%}}</style></head><body><h2>Original heading</h2><table role="presentation"><tr><td style="padding:0;border:0">Original text<img src="https://example.com/banner.png"></td></tr></table></body>' };
    for (const build of [buildReplyHtml, buildForwardHtml]) {
        const editor = document.createElement('div');
        editor.innerHTML = sanitizeComposeHtml(applySignatureHtml(build(email), '<p>Signature</p>'));
        editor.prepend(document.createTextNode('My edited message'));
        editor.querySelector('td').firstChild.textContent = 'Edited quote';
        const saved = sanitizeComposeHtml(editor.innerHTML);
        assert.match(saved, /My edited message/);
        assert.match(saved, /<style>@media\(max-width:600px\)/);
        assert.match(saved, /<h2>Original heading<\/h2>/);
        assert.match(saved, /style="padding:0;border:0"/);
        assert.match(saved, /Edited quote<img/);
        assert.ok(saved.indexOf('Signature') < saved.indexOf('data-mailshot-quoted'));
        assert.doesNotMatch(htmlToPlainText(saved), /@media|width:100%/);
    }
});
