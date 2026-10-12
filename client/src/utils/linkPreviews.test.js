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

test('labels Gmail Drive chips and deduplicates equivalent file URLs', () => {
    const links = getEmbeddableLinks({
        body_html: '<div class="gmail_drive_chip"><a href="https://drive.google.com/file/d/file123/view?usp=drive_web" aria-label="Handover.zip">Handover.zip</a></div>',
        body: 'Open https://drive.google.com/file/d/file123/view?usp=sharing'
    });

    assert.equal(links.length, 1);
    assert.equal(links[0].label, 'Handover.zip');
});
