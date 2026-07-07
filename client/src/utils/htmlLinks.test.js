import assert from 'node:assert/strict';
import { test } from 'node:test';

import { forceLinksToOpenInNewTab } from './htmlLinks.js';

const originalDocument = globalThis.document;

const createTemplateDocument = () => ({
    createElement: (tagName) => {
        assert.equal(tagName, 'template');
        const template = { _html: '', _links: [] };
        Object.defineProperty(template, 'innerHTML', {
            get: () => {
                let index = 0;
                return template._html.replace(/<a\b(?=[^>]*\bhref=)([^>]*)>/gi, () => {
                    const link = template._links[index++];
                    return `<a${link.attrs}>`;
                });
            },
            set: (value) => {
                template._html = String(value || '');
                template._links = [...template._html.matchAll(/<a\b(?=[^>]*\bhref=)([^>]*)>/gi)]
                    .map((match) => ({
                        attrs: match[1],
                        setAttribute(name, attrValue) {
                            this.attrs = this.attrs.replace(new RegExp(`\\s${name}=(["']).*?\\1`, 'i'), '');
                            this.attrs += ` ${name}="${attrValue}"`;
                        }
                    }));
            }
        });
        template.content = {
            querySelectorAll: (selector) => {
                assert.equal(selector, 'a[href]');
                return template._links;
            }
        };
        return template;
    }
});

test('forceLinksToOpenInNewTab adds target and rel to body links', () => {
    try {
        globalThis.document = createTemplateDocument();
        const html = forceLinksToOpenInNewTab('<p><a href="https://example.com">Example</a></p>');

        assert.match(html, /target="_blank"/);
        assert.match(html, /rel="noopener noreferrer"/);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('forceLinksToOpenInNewTab leaves non-link html unchanged without document', () => {
    try {
        globalThis.document = undefined;
        assert.equal(forceLinksToOpenInNewTab('<p>Hello</p>'), '<p>Hello</p>');
    } finally {
        globalThis.document = originalDocument;
    }
});
