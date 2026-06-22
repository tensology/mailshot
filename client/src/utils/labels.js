export const buildLabelNameMap = (labels = []) => {
    const map = new Map();
    labels.forEach((label) => {
        if (label?.slug) {
            map.set(label.slug, label.name || label.slug);
        }
        if (label?.name) {
            map.set(label.name, label.name);
        }
    });
    return map;
};

export const getLabelDisplayName = (token, labelNameMap = new Map()) => {
    if (!token) {
        return '';
    }
    if (labelNameMap.has(token)) {
        return labelNameMap.get(token);
    }
    return String(token)
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};
