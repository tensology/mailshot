import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clampReadSummaryPosition,
    getDefaultReadSummaryPosition
} from './readSummaryPanel.js';

test('default read summary position starts at bottom left', () => {
    assert.deepEqual(getDefaultReadSummaryPosition({
        viewportWidth: 1200,
        viewportHeight: 800,
        panelWidth: 384,
        panelHeight: 160
    }), {
        x: 16,
        y: 624
    });
});

test('read summary position stays inside the viewport', () => {
    assert.deepEqual(clampReadSummaryPosition({
        x: -50,
        y: 900,
        viewportWidth: 1200,
        viewportHeight: 800,
        panelWidth: 384,
        panelHeight: 160
    }), {
        x: 16,
        y: 624
    });

    assert.deepEqual(clampReadSummaryPosition({
        x: 700,
        y: 300,
        viewportWidth: 1200,
        viewportHeight: 800,
        panelWidth: 384,
        panelHeight: 160
    }), {
        x: 700,
        y: 300
    });
});
