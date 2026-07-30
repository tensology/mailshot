const PLAIN_QUOTE_PATTERNS = [
    /\nOn .+wrote:\s*\n/i,
    /\nOn .+ at .+, .+ wrote:\s*\n/i,
    /\n.+<[^>\s]+@[^>]+>\s*wrote:\s*\n/i,
    /\n-----Original Message-----/i,
    /\n-{2,}\s*Forwarded message\s*-{2,}/i,
    /\nBegin forwarded message:/i,
    /\nFrom:.+\n(?:Sent|Date|To|Subject):/i,
    /\n(?:From|Von|De):.+\n(?:Sent|Date|To|Subject|Cc|An|Betreff):/i,
    /\n_{5,}\n/
];

const HTML_QUOTE_PATTERNS = [
    /<div[^>]*class="[^"]*(?:gmail_quote|gmail_extra|yahoo_quoted|protonmail_quote|moz-cite-prefix)[^"]*"[\s\S]*$/i,
    /<div[^>]*id="[^"]*(?:divRplyFwdMsg|divtagdefaultwrapper|appendonsend)[^"]*"[\s\S]*$/i,
    /<blockquote[\s\S]*$/i,
    /<(?:div|p|br|table|hr)[^>]*>\s*(?:<[^>]+>\s*)*(?:-{2,}\s*)?Forwarded message[\s\S]*$/i,
    /<(?:div|p|br|table|hr)[^>]*>\s*(?:<[^>]+>\s*)*Begin forwarded message:[\s\S]*$/i,
    /<(?:div|p|br|table|hr)[^>]*>\s*(?:<[^>]+>\s*)*(?:<b[^>]*>)?\s*From:\s*(?:<\/b>)?[\s\S]{0,1500}?(?:<b[^>]*>)?\s*(?:Sent|Date|To|Subject|Cc):\s*(?:<\/b>)?[\s\S]*$/i,
    /<(?:div|p|br|table|hr)[^>]*>\s*(?:<[^>]+>\s*)*On[\s\S]{0,800}?wrote:\s*[\s\S]*$/i
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

    let earliestMatch = null;
    for (const pattern of HTML_QUOTE_PATTERNS) {
        const match = pattern.exec(source);
        if (!match || match.index <= 0) {
            continue;
        }
        if (!earliestMatch || match.index < earliestMatch.index) {
            earliestMatch = match;
        }
    }

    if (earliestMatch) {
        return {
            main: source.slice(0, earliestMatch.index).trim(),
            quoted: source.slice(earliestMatch.index).trim()
        };
    }

    return { main: source, quoted: '' };
};
