const labelCache = [];

const slugify = (value = '') => String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const getCachedLabels = () => [...labelCache].sort((a, b) => a.name.localeCompare(b.name));

export const createCachedLabel = ({ name, color = '#5f6368', slug }) => {
    const normalizedName = String(name || '').trim();
    const normalizedSlug = slugify(slug || normalizedName);
    const existing = labelCache.find((item) => item.slug === normalizedSlug);
    if (existing) {
        return existing;
    }

    const label = {
        _id: `label-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: normalizedName,
        slug: normalizedSlug,
        color,
        user_id: 'default'
    };

    labelCache.push(label);
    return label;
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

    return labelCache[index];
};

export const deleteCachedLabel = (id) => {
    const index = labelCache.findIndex((item) => item._id === id);
    if (index < 0) {
        return null;
    }

    const [removed] = labelCache.splice(index, 1);
    return removed;
};
