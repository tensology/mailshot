export const downloadAttachment = async ({
    call,
    path,
    filename = 'attachment',
    documentObject = document,
    urlObject = URL
}) => {
    const result = await call({}, path, { silent: true });
    if (result.error || !result.data) {
        return result.error ? result : { data: null, error: 'Attachment download returned no data' };
    }

    const objectUrl = urlObject.createObjectURL(result.data);
    try {
        const link = documentObject.createElement('a');
        link.href = objectUrl;
        link.download = filename || 'attachment';
        documentObject.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
        }
    } finally {
        urlObject.revokeObjectURL(objectUrl);
    }

    return result;
};

const SAFE_PREVIEW_TYPES = new Set([
    'application/pdf',
    'image/bmp',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/ogg',
    'video/quicktime',
    'video/webm'
]);

export const isSafeAttachmentPreviewType = (contentType = '') => (
    SAFE_PREVIEW_TYPES.has(String(contentType).toLowerCase().split(';', 1)[0].trim())
);

export const loadAttachmentPreview = async ({ call, path, urlObject = URL }) => {
    const result = await call({}, path, { silent: true });
    if (result.error || !result.data) {
        return result.error ? result : { data: null, error: 'Attachment preview returned no data' };
    }
    if (!isSafeAttachmentPreviewType(result.data.type)) {
        return { data: null, error: 'This file type cannot be previewed safely' };
    }

    return { data: urlObject.createObjectURL(result.data), error: null };
};
