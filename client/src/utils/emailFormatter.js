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

export const formatListPreview = ({ subject, body }, limit = 140) => {
    const normalizedSubject = normalizeText(subject) || 'No Subject';
    const normalizedBody = normalizeText(body);

    if (!normalizedBody) {
        return normalizedSubject;
    }

    if (normalizedSubject.length + 3 >= limit) {
        return truncateText(normalizedSubject, limit);
    }

    const availableForBody = limit - normalizedSubject.length - 3;
    const previewBody = truncateText(normalizedBody, availableForBody);

    return normalizedSubject + ' - ' + previewBody;
};

export const formatEmailBody = (value) => {
    return normalizeText(value)
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n');
};
