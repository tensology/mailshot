import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyParsedSearchToFilter, parseSearchQuery } from './search-query.js';

test('parseSearchQuery extracts operators and leaves free text', () => {
    const parsed = parseSearchQuery('invoice from:roland@x.com is:unread has:attachment refund');
    assert.equal(parsed.from, 'roland@x.com');
    assert.equal(parsed.read, false);
    assert.equal(parsed.has_attachment, true);
    assert.equal(parsed.free_text, 'invoice refund');
});

test('parseSearchQuery supports quoted subject', () => {
    const parsed = parseSearchQuery('subject:"quarterly report" to:paul');
    assert.equal(parsed.subject, 'quarterly report');
    assert.equal(parsed.to, 'paul');
    assert.equal(parsed.free_text, '');
});

test('applyParsedSearchToFilter merges into list filters', () => {
    const filter = applyParsedSearchToFilter(
        { type: 'inbox', unread: true },
        parseSearchQuery('from:a@b.com is:starred hello')
    );
    assert.equal(filter.from, 'a@b.com');
    assert.equal(filter.starred, true);
    assert.equal(filter.search, 'hello');
    assert.equal(filter.read, undefined);
});
