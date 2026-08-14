export const getVisibleAttachments = (email = {}) => {
    const seen = new Set();
    return (Array.isArray(email.attachments) ? email.attachments : [])
        .filter(Boolean)
        .filter((attachment) => {
            const key = [
                String(attachment.filename || '').toLowerCase(),
                String(attachment.size || ''),
                String(attachment.content_type || '').toLowerCase()
            ].join('|');
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
        .map((attachment) => ({
            ...attachment,
            emailId: email._id
        }));
};
