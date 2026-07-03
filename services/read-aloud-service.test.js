import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitSummaryForTts } from './read-aloud-service.js';

test('splitSummaryForTts chunks summaries without changing word order', () => {
    const summary = [
        'This email is about a long product update with several important details that should be spoken aloud.',
        'It includes follow-up actions, dates, deadlines, and enough extra explanatory text to require more than one chunk.',
        'The final sentence should still come after the earlier sentences.'
    ].join(' ');

    const chunks = splitSummaryForTts(summary, 120);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 120));
    assert.equal(chunks.join(' '), summary);
});

test('splitSummaryForTts splits long sentences at word boundaries where possible', () => {
    const summary = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron';
    const chunks = splitSummaryForTts(summary, 25);

    assert.deepEqual(chunks, [
        'alpha beta gamma delta',
        'epsilon zeta eta theta',
        'iota kappa lambda mu nu',
        'xi omicron'
    ]);
});
