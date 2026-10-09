import assert from 'node:assert/strict';
import test from 'node:test';

import { buildForwardHtml, buildReplyHtml } from './recipients.js';

const email = {
    from: 'Sender <sender@example.com>',
    to: 'Paul <paul@tensology.com>',
    cc: '',
    subject: 'Rich message',
    date: '2026-10-09T06:00:00.000Z',
    body: 'Plain fallback',
    body_html: '<html><head><style>ignored</style></head><body><table><tbody><tr><td style="color:red">Original</td></tr></tbody></table><img src="https://example.com/logo.png"></body></html>'
};

test('forward html preserves the original rich body', () => {
    const result = buildForwardHtml(email);

    assert.match(result, /data-mailshot-quoted="true"/);
    assert.match(result, /<table>/);
    assert.match(result, /style="color:red"/);
    assert.match(result, /<img src="https:\/\/example\.com\/logo\.png">/);
    assert.doesNotMatch(result, /<head>/);
});

test('reply html quotes the rich body and escapes header values', () => {
    const result = buildReplyHtml({ ...email, from: '<script>alert(1)</script>' });

    assert.match(result, /<blockquote data-mailshot-quoted="true"/);
    assert.match(result, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(result, /<table>/);
});
