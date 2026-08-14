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
