import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
const { buildEmailDocument } = await import('./emailDocument.js');
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

test('preserves newsletter layout, sender styles and mobile media queries without app table styling', () => {
    const original = '<html><head><style>@media(max-width:600px){.column{display:block;width:100%}}</style></head><body><table role="presentation" border="0"><tr><td style="padding:0"><table><tr><th>Item</th><td>Value</td></tr></table></td></tr></table></body></html>';
    const doc = parse(buildEmailDocument(parse(original).body.innerHTML, original));
    assert.match(doc.head.textContent, /@media\(max-width:600px\)/);
    assert.equal(doc.querySelector('table').getAttribute('role'), 'presentation');
    assert.equal(doc.querySelector('td').getAttribute('style'), 'padding:0');
    assert.equal(doc.querySelectorAll('table').length, 2);
    assert.doesNotMatch(doc.head.textContent, /36rem|:has\(th\)/);
});

test('removes active content and protects links and the frame with a restrictive policy', () => {
    const doc = parse(buildEmailDocument('<style>p{color:red}</style><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"><iframe src="https://example.com"></iframe><form action="/send"><input></form><a href="javascript:alert(1)">Bad</a><a href="https://example.com">Good</a>'));
    assert.equal(doc.querySelector('script,iframe,form,input'), null);
    assert.equal(doc.querySelector('img').getAttribute('onerror'), null);
    assert.equal(doc.querySelector('a').getAttribute('href'), null);
    assert.equal(doc.querySelector('a[href]').getAttribute('target'), '_blank');
    assert.equal(doc.querySelector('a[href]').getAttribute('rel'), 'noopener noreferrer');
    assert.match(doc.querySelector('meta').content, /default-src 'none'/);
    assert.match(doc.querySelector('meta').content, /form-action 'none'/);
});

test('retains sender body styling while rendering only the unfolded content', () => {
    const doc = parse(buildEmailDocument('<p>New reply</p>', '<html><body bgcolor="#ffffff" style="color:#123456"><p>New reply</p><blockquote>Old reply</blockquote></body></html>'));
    assert.equal(doc.body.getAttribute('bgcolor'), '#ffffff');
    assert.equal(doc.body.style.color, 'rgb(18, 52, 86)');
    assert.equal(doc.body.textContent, 'New reply');
});
