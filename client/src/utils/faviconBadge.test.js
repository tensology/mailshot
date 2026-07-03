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
    const canvases = [];
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
            createElement: () => {
                const canvas = {
                    getContext: () => context,
                    toDataURL: () => 'data:image/png;base64,badge'
                };
                canvases.push(canvas);
                return canvas;
            }
        };

        setMailshotFaviconBadge(7);

        assert.equal(link.type, 'image/png');
        assert.equal(link.href, 'data:image/png;base64,badge');
        assert.equal(canvases[0].width, 128);
        assert.equal(canvases[0].height, 128);
    } finally {
        globalThis.document = originalDocument;
    }
});
