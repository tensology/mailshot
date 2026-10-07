import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { sanitizeComposeHtml } = await import('./composeHtml.js');

test('preserves safe table markup and removes unsafe content', () => {
    const result = sanitizeComposeHtml('<table><tbody><tr><th>Invoice</th><td style="text-align:right">R 100</td></tr></tbody></table><script>alert(1)</script>');

    assert.match(result, /<table>/);
    assert.match(result, /<th>Invoice<\/th>/);
    assert.match(result, /<td style="text-align:right">R 100<\/td>/);
    assert.doesNotMatch(result, /script|alert/);
});
