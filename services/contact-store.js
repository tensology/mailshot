const contactCache = [];

export const getCachedContacts = () => {
    return [...contactCache].sort((a, b) => a.name.localeCompare(b.name));
};

export const getCachedContactById = (id) => {
    return contactCache.find((item) => item._id === id) || null;
};

export const createCachedContact = (payload = {}) => {
    const contact = {
        _id: `contact-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: String(payload.name || '').trim(),
        email: String(payload.email || '').trim().toLowerCase(),
        phone: String(payload.phone || '').trim(),
        company: String(payload.company || '').trim(),
        notes: String(payload.notes || '').trim()
    };

    contactCache.push(contact);
    return contact;
};

export const updateCachedContact = (id, updates = {}) => {
    const index = contactCache.findIndex((item) => item._id === id);
    if (index < 0) {
        return null;
    }

    contactCache[index] = {
        ...contactCache[index],
        ...updates,
        name: updates.name !== undefined ? String(updates.name).trim() : contactCache[index].name,
        email: updates.email !== undefined ? String(updates.email).trim().toLowerCase() : contactCache[index].email,
        phone: updates.phone !== undefined ? String(updates.phone).trim() : contactCache[index].phone,
        company: updates.company !== undefined ? String(updates.company).trim() : contactCache[index].company,
        notes: updates.notes !== undefined ? String(updates.notes).trim() : contactCache[index].notes
    };

    return contactCache[index];
};

export const deleteCachedContact = (id) => {
    const index = contactCache.findIndex((item) => item._id === id);
    if (index < 0) {
        return null;
    }

    const [removed] = contactCache.splice(index, 1);
    return removed;
};
