const PLAIN_QUOTE_PATTERNS = [
    /\nOn .+wrote:\s*\n/i,
    /\n-----Original Message-----/i,
    /\nFrom:.+\nSent:/i,
    /\n_{5,}\n/
];

export const splitPlainQuotedContent = (text = '') => {
    const source = String(text || '');
    if (!source.trim()) {
        return { main: '', quoted: '' };
    }

    for (const pattern of PLAIN_QUOTE_PATTERNS) {
        const match = pattern.exec(source);
        if (match && match.index > 0) {
            return {
                main: source.slice(0, match.index).trimEnd(),
                quoted: source.slice(match.index).trimStart()
            };
        }
    }

    const lines = source.split('\n');
    const quoteStart = lines.findIndex((line) => line.trim().startsWith('>'));
    if (quoteStart > 0) {
        return {
            main: lines.slice(0, quoteStart).join('\n').trimEnd(),
            quoted: lines.slice(quoteStart).join('\n').trimStart()
        };
    }

    return { main: source, quoted: '' };
};

export const splitHtmlQuotedContent = (html = '') => {
    const source = String(html || '');
    if (!source.trim()) {
        return { main: '', quoted: '' };
    }

    const gmailQuoteMatch = /<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i.exec(source);
    if (gmailQuoteMatch && gmailQuoteMatch.index > 0) {
        return {
            main: source.slice(0, gmailQuoteMatch.index).trim(),
            quoted: source.slice(gmailQuoteMatch.index).trim()
        };
    }

    const blockquoteMatch = /<blockquote[\s\S]*$/i.exec(source);
    if (blockquoteMatch && blockquoteMatch.index > 0) {
        return {
            main: source.slice(0, blockquoteMatch.index).trim(),
            quoted: source.slice(blockquoteMatch.index).trim()
        };
    }

    return { main: source, quoted: '' };
};
