export const truncateText = (value, maxLength) => {
    const normalized = normalizeText(value);
    const limit = Number(maxLength) > 0 ? Number(maxLength) : 120;

    if (normalized.length <= limit) {
        return normalized;
    }

    const trimmedLength = Math.max(limit - 1, 0);
    return normalized.slice(0, trimmedLength).trimEnd() + '\u2026';
};

export const normalizeText = (value) => {
    return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+$/u, '')
        .replace(/^\s+/u, '')
        .trim();
};

export const stripHtml = (value = '') => {
    return normalizeText(
        String(value)
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
    );
};

export const parseSenderName = (fromValue = '') => {
    const value = String(fromValue || '').trim();
    const quotedMatch = /^"([^"]+)"\s*</.exec(value);
    if (quotedMatch) {
        return quotedMatch[1];
    }

    const bracketMatch = /^(.*?)\s*<[^>]+>$/.exec(value);
    if (bracketMatch && bracketMatch[1]) {
        return bracketMatch[1].replace(/"/g, '').trim();
    }

    if (value.includes('@')) {
        return value.split('@')[0];
    }

    return value || 'Unknown';
};

export const parseSenderEmail = (fromValue = '') => {
    const value = String(fromValue || '').trim();
    const bracketMatch = /<([^>]+)>/.exec(value);
    if (bracketMatch) {
        return bracketMatch[1];
    }
    return value;
};

export const formatListPreview = ({ subject, body, body_html }, limit = 140) => {
    const normalizedSubject = normalizeText(subject) || '(no subject)';
    const normalizedBody = stripHtml(body_html || body);

    if (!normalizedBody) {
        return normalizedSubject;
    }

    const combined = `${normalizedSubject} - ${normalizedBody}`;
    return truncateText(combined, limit);
};

export const formatEmailBody = (value) => {
    return normalizeText(value)
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n');
};

export const extractHtmlBody = (html = '') => {
    const source = String(html || '').trim();
    if (!source) {
        return '';
    }

    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(source);
    if (bodyMatch) {
        return bodyMatch[1].trim();
    }

    return source
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?html[^>]*>/gi, '')
        .replace(/<head[\s\S]*?<\/head>/gi, '')
        .trim();
};

export const formatEmailDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    const isThisYear = date.getFullYear() === now.getFullYear();
    if (isThisYear) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return date.toLocaleDateString();
};
