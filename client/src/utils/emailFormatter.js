export const truncateText = (value, maxLength) => {
    const normalized = normalizeText(value);
    const limit = Number(maxLength) > 0 ? Number(maxLength) : 120;

    if (normalized.length <= limit) {
        return normalized;
    }

    const trimmedLength = Math.max(limit - 1, 0);
    return normalized.slice(0, trimmedLength).trimEnd() + '\u2026';
};

export const decodeHtmlEntities = (value = '') => {
    return String(value)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&zwnj;/gi, '')
        .replace(/&zwj;/gi, '')
        .replace(/&shy;/gi, '')
        .replace(/&mdash;/gi, '-')
        .replace(/&ndash;/gi, '-')
        .replace(/&hellip;/gi, '...')
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
};

export const normalizeText = (value) => {
    return decodeHtmlEntities(String(value || ''))
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u034f\u180e\u2000-\u200f\u202f\u205f\u2060\u00ad]/g, '')
        .replace(/\s+$/u, '')
        .replace(/^\s+/u, '')
        .trim();
};

export const stripHtml = (value = '') => {
    return normalizeText(
        String(value)
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<\/p>/gi, ' ')
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
    const normalizedSubject = stripHtml(subject) || '(no subject)';
    const normalizedBody = stripHtml(body_html || body);

    if (!normalizedBody) {
        return normalizedSubject;
    }

    const combined = `${normalizedSubject} - ${normalizedBody}`;
    return truncateText(combined, limit);
};

export const formatBodyPreview = ({ body, body_html }) => {
    const normalizedBody = stripHtml(body_html || body);
    return normalizedBody;
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

export const formatEmailDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const datePart = date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' })
    });
    const timePart = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${datePart} ${timePart}`;
};

export const formatEmailDateParts = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return { date: '', time: '' };
    }

    return {
        date: date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' })
        }),
        time: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    };
};
