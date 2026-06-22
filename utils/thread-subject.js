const toPlainEmail = (email) => (email?.toObject ? email.toObject() : email);

export const normalizeThreadSubject = (subject = '') => {
    let normalized = String(subject || '').trim();
    if (!normalized) {
        return '';
    }

    let previous = '';
    while (previous !== normalized) {
        previous = normalized;
        normalized = normalized.replace(/^(re|fwd|fw):\s*/i, '').trim();
    }

    return normalized.toLowerCase();
};

export const compactEmailsBySubject = (emails = []) => {
    const groups = new Map();
    const standalone = [];

    for (const rawEmail of emails) {
        const email = toPlainEmail(rawEmail);
        const subjectKey = normalizeThreadSubject(email.subject);

        if (!subjectKey) {
            standalone.push({
                ...email,
                thread_count: 1,
                thread_ids: [String(email._id)]
            });
            continue;
        }

        if (!groups.has(subjectKey)) {
            groups.set(subjectKey, []);
        }
        groups.get(subjectKey).push(email);
    }

    const compacted = [];

    for (const group of groups.values()) {
        const sorted = [...group].sort((left, right) => new Date(right.date) - new Date(left.date));
        const latest = sorted[0];
        const threadIds = sorted.map((item) => String(item._id));
        const labels = [...new Set(sorted.flatMap((item) => item.labels || []))];

        compacted.push({
            ...latest,
            read: sorted.every((item) => item.read),
            starred: sorted.some((item) => item.starred),
            labels,
            thread_count: sorted.length,
            thread_ids: threadIds
        });
    }

    return [...compacted, ...standalone].sort((left, right) => new Date(right.date) - new Date(left.date));
};

export const findEmailsBySubject = (emails = [], anchorEmail) => {
    const subjectKey = normalizeThreadSubject(anchorEmail?.subject);
    if (!subjectKey) {
        return [];
    }

    return emails.filter((item) => normalizeThreadSubject(item.subject) === subjectKey);
};

export const mergeThreadEmails = (anchorEmail, ...collections) => {
    const byId = new Map();

    const add = (item) => {
        if (!item) {
            return;
        }
        const plain = toPlainEmail(item);
        byId.set(String(plain._id), plain);
    };

    add(anchorEmail);
    collections.flat().forEach(add);

    return [...byId.values()].sort((left, right) => new Date(left.date) - new Date(right.date));
};
