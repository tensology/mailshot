import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Renders the dev-agent's replies (markdown) as real formatted content:
// headings, bold/italic, lists, tables, links and code blocks.
const Markdown = ({ children, className = '', invert = false }) => {
    const html = useMemo(() => {
        const source = String(children ?? '');
        if (!source) {
            return '';
        }
        let raw = '';
        try {
            raw = marked.parse(source, { gfm: true, breaks: true, async: false });
        } catch {
            raw = source.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
        }
        return DOMPurify.sanitize(String(raw), {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target', 'rel']
        });
    }, [children]);

    if (!html) {
        return null;
    }

    return (
        <div
            className={`markdown ${invert ? 'markdown-invert' : ''} ${className}`}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

export default Markdown;
