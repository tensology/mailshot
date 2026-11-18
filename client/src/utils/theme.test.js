import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { normalizeTheme, readTheme, resolveTheme, applyTheme } from './theme.js';
import { applyEmailTheme } from './emailTheme.js';

test('theme defaults, saved preferences, blocked storage and system resolution', () => {
    for (const value of [null, undefined, '', 'invalid']) assert.equal(normalizeTheme(value), 'light');
    assert.equal(readTheme({ getItem: () => 'dark' }), 'dark');
    assert.equal(readTheme({ getItem: () => { throw Error('blocked'); } }), 'light');
    for (const dark of [true, false]) {
        assert.equal(resolveTheme('light', dark), 'light');
        assert.equal(resolveTheme('dark', dark), 'dark');
        assert.equal(resolveTheme('system', dark), dark ? 'dark' : 'light');
    }
});

test('theme updates root, native controls and browser chrome', () => {
    const { document } = new JSDOM('<meta name="theme-color">').window;
    applyTheme('dark', document.documentElement);
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal(document.documentElement.style.colorScheme, 'dark');
    assert.equal(document.querySelector('meta').content, '#0f172a');
    applyTheme('light', document.documentElement);
    assert.equal(document.querySelector('meta').content, '#ffffff');
});

test('frame theme preserves message HTML, branded images, layout and draft serialization across toggles', () => {
    const { document } = new JSDOM('<body bgcolor="white" style="background-color: white;color: black"><table><tr><td style="background-color:#ffffff;color:#123456">Message<img src="https://example.com/logo.png"></td></tr></table><a href="https://example.com">Link</a></body>').window;
    const original = document.body.outerHTML;
    applyEmailTheme(document, 'dark');
    assert.equal(document.body.outerHTML, original);
    const rules = document.getElementById('mailshot-frame-theme').textContent;
    assert.match(rules, /background-color: #0f172a/);
    assert.match(rules, /color: #e2e8f0/);
    assert.match(rules, /color: #93c5fd/);
    assert.doesNotMatch(rules, /filter:|display:|width:/);
    applyEmailTheme(document, 'dark');
    assert.equal(document.querySelectorAll('#mailshot-frame-theme').length, 1);
    applyEmailTheme(document, 'light');
    assert.equal(document.getElementById('mailshot-frame-theme'), null);
    assert.equal(document.body.outerHTML, original);
});
