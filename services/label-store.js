import fs from 'fs';
import path from 'path';
import { slugify } from '../utils/slug.js';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'labels-cache.json');

const labelCache = [];

export const getCachedLabels = () => [...labelCache].sort((a, b) => a.name.localeCompare(b.name));

export const getLabelBySlug = (slug) => labelCache.find((item) => item.slug === slug) || null;

export const loadLabelsFromDisk = () => {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return 0;
        }

        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (!Array.isArray(parsed?.labels)) {
            return 0;
        }

        labelCache.length = 0;
        parsed.labels.forEach((item) => {
            if (!item?.slug || !item?.name) {
                return;
            }
            labelCache.push({
                _id: item._id || `label-${item.slug}`,
                name: item.name,
                slug: item.slug,
                color: item.color || '#5f6368',
                user_id: item.user_id || 'default'
            });
        });

        return labelCache.length;
    } catch (error) {
        console.error('Failed to load labels cache from disk:', error.message);
        return 0;
    }
};

export const saveLabelsToDisk = () => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            saved_at: new Date().toISOString(),
            labels: labelCache
        }));
        return labelCache.length;
    } catch (error) {
        console.error('Failed to save labels cache to disk:', error.message);
        return 0;
    }
};

export const createCachedLabel = ({ name, color = '#5f6368', slug }) => {
    const normalizedName = String(name || '').trim();
    const normalizedSlug = slugify(slug || normalizedName);
    if (!normalizedName || !normalizedSlug) {
        return null;
    }

    const existing = labelCache.find((item) => item.slug === normalizedSlug);
    if (existing) {
        return existing;
    }

    const label = {
        _id: `label-${normalizedSlug}`,
        name: normalizedName,
        slug: normalizedSlug,
        color,
        user_id: 'default'
    };

    labelCache.push(label);
    saveLabelsToDisk();
    return label;
};

export const ensureCachedLabel = (nameOrSlug) => {
    const raw = String(nameOrSlug || '').trim();
    if (!raw) {
        return null;
    }

    const asSlug = slugify(raw);
    const bySlug = labelCache.find((item) => item.slug === asSlug);
    if (bySlug) {
        return bySlug;
    }

    const byName = labelCache.find((item) => item.name.toLowerCase() === raw.toLowerCase());
    if (byName) {
        return byName;
    }

    return createCachedLabel({ name: raw, slug: asSlug });
};

export const normalizeLabelToken = (token) => {
    const raw = String(token || '').trim();
    if (!raw) {
        return '';
    }

    const existing = ensureCachedLabel(raw);
    return existing?.slug || slugify(raw);
};

export const updateCachedLabel = (id, updates = {}) => {
    const index = labelCache.findIndex((item) => item._id === id);
    if (index < 0) {
        return null;
    }

    labelCache[index] = {
        ...labelCache[index],
        ...updates,
        slug: updates.slug ? slugify(updates.slug) : labelCache[index].slug
    };

    saveLabelsToDisk();
    return labelCache[index];
};

export const deleteCachedLabel = (id) => {
    const index = labelCache.findIndex((item) => item._id === id);
    if (index < 0) {
        return null;
    }

    const [removed] = labelCache.splice(index, 1);
    saveLabelsToDisk();
    return removed;
};

export const deleteCachedLabelBySlug = (slug) => {
    const index = labelCache.findIndex((item) => item.slug === slug);
    if (index < 0) {
        return null;
    }

    const [removed] = labelCache.splice(index, 1);
    saveLabelsToDisk();
    return removed;
};
