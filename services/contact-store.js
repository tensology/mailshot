import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'contacts-cache.json');

const contactCache = [];

export const getCachedContacts = () => [...contactCache].sort((a, b) => a.name.localeCompare(b.name));

export const getCachedContactById = (id) => contactCache.find((item) => item._id === id) || null;

export const getCachedContactByEmail = (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    return contactCache.find((item) => item.email === normalized) || null;
};

export const loadContactsFromDisk = () => {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return 0;
        }

        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (!Array.isArray(parsed?.contacts)) {
            return 0;
        }

        contactCache.length = 0;
        parsed.contacts.forEach((item) => {
            if (!item?.email) {
                return;
            }
            contactCache.push({
                _id: item._id || `contact-${item.email}`,
                name: String(item.name || '').trim() || item.email,
                email: String(item.email).trim().toLowerCase(),
                phone: String(item.phone || '').trim(),
                company: String(item.company || '').trim(),
                notes: String(item.notes || '').trim()
            });
        });

        return contactCache.length;
    } catch (error) {
        console.error('Failed to load contacts cache from disk:', error.message);
        return 0;
    }
};

export const saveContactsToDisk = () => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            saved_at: new Date().toISOString(),
            contacts: contactCache
        }));
        return contactCache.length;
    } catch (error) {
        console.error('Failed to save contacts cache to disk:', error.message);
        return 0;
    }
};

export const createCachedContact = (payload = {}) => {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) {
        return null;
    }

    const existing = getCachedContactByEmail(email);
    if (existing) {
        return existing;
    }

    const contact = {
        _id: `contact-${email.replace(/[^a-z0-9]+/g, '-')}`,
        name: String(payload.name || '').trim() || email,
        email,
        phone: String(payload.phone || '').trim(),
        company: String(payload.company || '').trim(),
        notes: String(payload.notes || '').trim()
    };

    contactCache.push(contact);
    saveContactsToDisk();
    return contact;
};

export const upsertCachedContact = (payload = {}) => {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) {
        return null;
    }

    const existing = getCachedContactByEmail(email);
    if (existing) {
        if (payload.name && !existing.name) {
            existing.name = String(payload.name).trim();
            saveContactsToDisk();
        }
        return existing;
    }

    return createCachedContact(payload);
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

    saveContactsToDisk();
    return contactCache[index];
};

export const deleteCachedContact = (id) => {
    const index = contactCache.findIndex((item) => item._id === id);
    if (index < 0) {
        return null;
    }

    const [removed] = contactCache.splice(index, 1);
    saveContactsToDisk();
    return removed;
};
