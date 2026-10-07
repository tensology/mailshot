import test from 'node:test';
import assert from 'node:assert/strict';

import {
    splitHtmlQuotedContent,
    splitPlainQuotedContent
} from './quoteSplitter.js';

test('splits plain reply headers into main and folded content', () => {
    const result = splitPlainQuotedContent([
        'Thanks, I agree.',
        '',
        'From: Roland <roland@example.com>',
        'Sent: Thursday, July 30, 2026 10:00 AM',
        'To: Paul <paul@tensology.com>',
        'Subject: Update',
        '',
        'Older message'
    ].join('\n'));

    assert.equal(result.main, 'Thanks, I agree.');
    assert.match(result.quoted, /Older message/);
});

test('splits html Outlook-style reply headers into folded content', () => {
    const result = splitHtmlQuotedContent([
        '<div>Fresh reply</div>',
        '<div><b>From:</b> Roland &lt;roland@example.com&gt;</div>',
        '<div><b>Sent:</b> Thursday, July 30, 2026 10:00 AM</div>',
        '<div><b>To:</b> Paul &lt;paul@tensology.com&gt;</div>',
        '<div>Older message</div>'
    ].join(''));

    assert.equal(result.main, '<div>Fresh reply</div>');
    assert.match(result.quoted, /Older message/);
});

test('folds a Zoho reply header with the quoted message', () => {
    const result = splitHtmlQuotedContent([
        '<div>Fresh reply</div>',
        '<div data-zbluepencil-ignore="true">',
        '<div><br><br></div>',
        '<div class="replyHeader">---- On Wed, 30 Sep 2026 Paul wrote ----</div>',
        '</div>',
        '<blockquote>Older message</blockquote>'
    ].join(''));

    assert.equal(result.main, '<div>Fresh reply</div>');
    assert.match(result.quoted, /replyHeader/);
    assert.match(result.quoted, /Older message/);
});

test('does not fold an ordinary blockquote in the new message', () => {
    const html = '<div>Fresh reply</div><blockquote>A quotation used in the reply.</blockquote><div>Closing sentence.</div>';

    assert.deepEqual(splitHtmlQuotedContent(html), { main: html, quoted: '' });
});

test('folds an Apple Mail cite blockquote', () => {
    const result = splitHtmlQuotedContent('<div>Fresh reply</div><blockquote type="cite">Older message</blockquote>');

    assert.equal(result.main, '<div>Fresh reply</div>');
    assert.match(result.quoted, /Older message/);
});

test('uses the earliest plain-text quote boundary across supported formats', () => {
    const result = splitPlainQuotedContent([
        'Fresh reply',
        '',
        'On Tue, 6 Oct 2026, Paul wrote:',
        'Earlier reply',
        '',
        '-----Original Message-----',
        'Oldest reply'
    ].join('\n'));

    assert.equal(result.main, 'Fresh reply');
    assert.match(result.quoted, /^On Tue/);
});
