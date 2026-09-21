/**
 * Parse Gmail-style search operators from a free-text query.
 * Bare tokens remain as free-text search across body/subject/addresses.
 */

const OPERATOR_RE = /\b(from|to|subject|has|is):(?:"([^"]+)"|(\S+))/gi;

export const parseSearchQuery = (raw = '') => {
    const input = String(raw || '').trim();
    if (!input) {
        return {
            free_text: '',
            from: '',
            to: '',
            subject: '',
            has_attachment: false,
            read: undefined,
            starred: undefined
        };
    }

    let freeText = input;
    const result = {
        free_text: '',
        from: '',
        to: '',
        subject: '',
        has_attachment: false,
        read: undefined,
        starred: undefined
    };

    freeText = freeText.replace(OPERATOR_RE, (_, operator, quoted, bare) => {
        const value = String(quoted || bare || '').trim().toLowerCase();
        const op = String(operator || '').toLowerCase();

        if (op === 'from') {
            result.from = value;
        } else if (op === 'to') {
            result.to = value;
        } else if (op === 'subject') {
            result.subject = value;
        } else if (op === 'has' && value === 'attachment') {
            result.has_attachment = true;
        } else if (op === 'is') {
            if (value === 'unread') {
                result.read = false;
            } else if (value === 'read') {
                result.read = true;
            } else if (value === 'starred') {
                result.starred = true;
            }
        }

        return ' ';
    });

    result.free_text = freeText.replace(/\s+/g, ' ').trim();
    return result;
};

export const applyParsedSearchToFilter = (filter = {}, parsed = {}) => {
    const next = { ...filter };

    if (parsed.free_text) {
        next.search = parsed.free_text;
    } else {
        delete next.search;
    }

    if (parsed.from) {
        next.from = parsed.from;
    }
    if (parsed.to) {
        next.to = parsed.to;
    }
    if (parsed.subject) {
        next.subject = parsed.subject;
    }
    if (parsed.has_attachment) {
        next.has_attachment = true;
    }
    if (parsed.read !== undefined) {
        next.read = parsed.read;
        delete next.unread;
    }
    if (parsed.starred === true) {
        next.starred = true;
    }

    return next;
};
