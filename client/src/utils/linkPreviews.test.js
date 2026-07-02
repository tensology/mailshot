import assert from 'node:assert/strict';
import test from 'node:test';

import { getEmbeddableLinks } from './linkPreviews.js';

test('extracts YouTube and Google Drive preview links from email bodies', () => {
    const links = getEmbeddableLinks({
        body: 'Watch https://youtu.be/abc123 and open https://drive.google.com/file/d/file123/view?usp=sharing'
    });

    assert.deepEqual(links.map((link) => link.type), ['youtube', 'drive']);
    assert.equal(links[0].embedUrl, 'https://www.youtube.com/embed/abc123');
    assert.equal(links[1].embedUrl, 'https://drive.google.com/file/d/file123/preview');
});
