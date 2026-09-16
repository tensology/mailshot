const MAX_SUGGESTIONS = 8;

export const cleanContactName = (name = '') => (
    String(name || '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '')
        .trim()
);

export const getActiveRecipientQuery = (value = '') => {
    const parts = String(value || '').split(',');
    return String(parts[parts.length - 1] || '').trim();
};

export const contactMatchesQuery = (contact = {}, query = '') => {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) {
        return false;
    }

    const name = cleanContactName(contact.name).toLowerCase();
    const email = String(contact.email || '').trim().toLowerCase();
    return name.includes(needle) || email.includes(needle);
};

export const filterContactSuggestions = (contacts = [], query = '', limit = MAX_SUGGESTIONS) => {
    const needle = String(query || '').trim();
    if (!needle) {
        return [];
    }

    return (Array.isArray(contacts) ? contacts : [])
        .filter((contact) => contactMatchesQuery(contact, needle))
        .slice(0, Math.max(1, Number(limit) || MAX_SUGGESTIONS));
};

export const applyContactSuggestion = (fieldValue = '', contact = {}) => {
    const email = String(contact.email || '').trim();
    if (!email) {
        return String(fieldValue || '');
    }

    const parts = String(fieldValue || '').split(',');
    parts[parts.length - 1] = ` ${email}`;
    return parts
        .map((part) => part.trim())
        .filter(Boolean)
        .join(', ');
};
