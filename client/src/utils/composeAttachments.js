const fileKey = (file) => [
    file?.name || '',
    file?.size || 0,
    file?.lastModified || 0
].join('|');

export const appendComposeAttachments = (current = [], next = []) => {
    const files = [...(Array.isArray(current) ? current : [])];
    const seen = new Set(files.map(fileKey));

    Array.from(next || []).forEach((file) => {
        const key = fileKey(file);
        if (!seen.has(key)) {
            seen.add(key);
            files.push(file);
        }
    });

    return files;
};

export const removeComposeAttachmentAt = (current = [], index) => (
    (Array.isArray(current) ? current : []).filter((_, itemIndex) => itemIndex !== index)
);

export const describeComposeAttachments = (attachments = []) => {
    const count = Array.isArray(attachments) ? attachments.length : 0;
    return `${count} attachment${count === 1 ? '' : 's'} will be sent with this email`;
};
