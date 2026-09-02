export const isFileDropEvent = (event = {}) => (
    Boolean(event.dataTransfer)
    && Array.from(event.dataTransfer.types || []).includes('Files')
);

export const filesFromAttachmentEvent = (event = {}) => {
    if (event.dataTransfer && !isFileDropEvent(event)) {
        return [];
    }

    const fileList = event.dataTransfer?.files || event.target?.files;
    return fileList ? Array.from(fileList) : [];
};

export const fileIdentity = (file = {}) => (
    `${file.name || file.filename || ''}:${Number(file.size) || 0}:${file.type || ''}:${Number(file.lastModified) || 0}`
);

export const attachmentFingerprint = (attachment = {}) => (
    `${attachment.name || attachment.filename || ''}:${Number(attachment.size) || 0}`
);

export const appendUniqueFiles = (current = [], incoming = [], saved = []) => {
    const fingerprints = new Set([...current, ...saved].map(attachmentFingerprint));
    return [...current, ...incoming.filter((file) => {
        const fingerprint = attachmentFingerprint(file);
        if (fingerprints.has(fingerprint)) {
            return false;
        }
        fingerprints.add(fingerprint);
        return true;
    })];
};

export const resolveCapturedAttachmentIntent = ({
    currentSaved = [],
    currentPending = [],
    capturedSaved = [],
    capturedPending = []
} = {}) => {
    const capturedSavedIds = new Set(capturedSaved.map((attachment) => attachment.attachment_id).filter(Boolean));
    const capturedPendingIds = new Set(capturedPending.map(fileIdentity));
    const capturedPendingFingerprints = new Set(capturedPending.map(attachmentFingerprint));

    return {
        saved: currentSaved.filter((attachment) => (
            capturedSavedIds.has(attachment.attachment_id)
            || capturedPendingFingerprints.has(attachmentFingerprint(attachment))
        )),
        pending: currentPending.filter((file) => capturedPendingIds.has(fileIdentity(file)))
    };
};

export const reconcileAttachmentSave = ({
    currentSaved = [],
    currentPending = [],
    requestedSaved = [],
    requestedPending = [],
    returnedSaved = []
} = {}) => {
    const requestedSavedIds = new Set(requestedSaved.map((attachment) => attachment.attachment_id).filter(Boolean));
    const currentSavedIds = new Set(currentSaved.map((attachment) => attachment.attachment_id).filter(Boolean));
    const currentPendingIds = new Set(currentPending.map(fileIdentity));
    const eligibleUploads = requestedPending.filter((file) => currentPendingIds.has(fileIdentity(file)));
    const uploadedIds = new Set();
    const acceptedReturned = returnedSaved.filter((attachment) => {
        if (requestedSavedIds.has(attachment.attachment_id)) {
            return currentSavedIds.has(attachment.attachment_id);
        }

        const fingerprint = attachmentFingerprint(attachment);
        const matchingIndex = eligibleUploads.findIndex((file) => attachmentFingerprint(file) === fingerprint);
        if (matchingIndex === -1) {
            return false;
        }
        uploadedIds.add(fileIdentity(eligibleUploads[matchingIndex]));
        eligibleUploads.splice(matchingIndex, 1);
        return true;
    });
    const returnedById = new Map(
        acceptedReturned
            .filter((attachment) => attachment.attachment_id)
            .map((attachment) => [attachment.attachment_id, attachment])
    );
    const savedIds = new Set(currentSavedIds);

    return {
        saved: [
            ...currentSaved.map((attachment) => returnedById.get(attachment.attachment_id) || attachment),
            ...acceptedReturned.filter((attachment) => {
                if (!attachment.attachment_id || savedIds.has(attachment.attachment_id)) {
                    return false;
                }
                savedIds.add(attachment.attachment_id);
                return true;
            })
        ],
        pending: currentPending.filter((file) => !uploadedIds.has(fileIdentity(file)))
    };
};
