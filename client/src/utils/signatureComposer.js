export const htmlToPlainText = (html = '') => {
    const source = String(html || '');
    if (!source.trim()) return '';

    if (typeof document !== 'undefined') {
        const container = document.createElement('div');
        container.innerHTML = source;
        return (container.innerText || container.textContent || '').trim();
    }

    return source
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
};

const trimHtml = (html = '') => String(html || '').trim();

const stripForcedImageSizing = (tag = '') => tag.replace(/\sstyle=(["'])(.*?)\1/i, (match, quote, style) => {
    const declarations = style
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .filter((declaration) => {
            const [property, ...valueParts] = declaration.split(':');
            const propertyName = String(property || '').trim().toLowerCase();
            const value = valueParts.join(':').trim().toLowerCase();
            return !(
                (propertyName === 'width' && ['100%', '520px'].includes(value))
                || (propertyName === 'max-width' && ['100%', '240px', '520px'].includes(value))
            );
        });

    return declarations.length ? ` style=${quote}${declarations.join(';')};${quote}` : '';
});

export const normalizeSignatureHtml = (html = '') => trimHtml(html)
    .replace(/<img\b[^>]*>/gi, stripForcedImageSizing);

export const normalizeSignatureOptions = (general = {}, fallbackEmail = 'paul@tensology.com') => {
    const entries = Array.isArray(general.signatures) ? general.signatures : [];
    const email = general.selected_email || general.email || fallbackEmail;
    const source = entries.length
        ? entries
        : [{ email, signature_html: general.signature_html || '' }];

    return source
        .map((entry) => {
            const html = normalizeSignatureHtml(entry.signature_html || '');
            return {
                email: String(entry.email || '').trim().toLowerCase(),
                html,
                text: htmlToPlainText(html)
            };
        })
        .filter((entry) => entry.email && (entry.html || entry.text));
};

export const removeTrailingSignatureHtml = (bodyHtml = '', signatureHtml = '') => {
    const body = trimHtml(bodyHtml);
    const signature = trimHtml(signatureHtml);
    if (!body || !signature || !body.endsWith(signature)) {
        return bodyHtml;
    }

    return body.slice(0, body.length - signature.length).replace(/(?:<br\s*\/?>|\s)+$/gi, '');
};

export const applySignatureHtml = (bodyHtml = '', nextSignatureHtml = '', previousSignatureHtml = '') => {
    const withoutPrevious = removeTrailingSignatureHtml(bodyHtml, previousSignatureHtml);
    const next = trimHtml(nextSignatureHtml);
    if (!next) {
        return withoutPrevious;
    }
    if (removeTrailingSignatureHtml(withoutPrevious, next) !== withoutPrevious) {
        return withoutPrevious;
    }
    const body = trimHtml(withoutPrevious);
    return `${body}${body ? '<br>' : '<br><br>'}${next}`;
};
