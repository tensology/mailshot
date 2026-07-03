import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setMailshotFaviconBadge } from './faviconBadge.js';

const originalDocument = globalThis.document;

test('setMailshotFaviconBadge falls back to the base icon when count is zero', () => {
    const link = {};
    try {
        globalThis.document = {
            querySelector: () => link,
            createElement: () => ({})
        };

        setMailshotFaviconBadge(0);

        assert.equal(link.type, 'image/svg+xml');
        assert.equal(link.href, '/favicon.svg');
    } finally {
        globalThis.document = originalDocument;
    }
});

test('setMailshotFaviconBadge draws a png favicon when unread count is positive', () => {
    const link = {};
    const context = {
        beginPath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        closePath() {},
        fill() {},
        stroke() {},
        fillText() {}
    };
    try {
        globalThis.document = {
            querySelector: () => link,
            createElement: () => ({
                getContext: () => context,
                toDataURL: () => 'data:image/png;base64,badge'
            })
        };

        setMailshotFaviconBadge(7);

        assert.equal(link.type, 'image/png');
        assert.equal(link.href, 'data:image/png;base64,badge');
    } finally {
        globalThis.document = originalDocument;
    }
});
