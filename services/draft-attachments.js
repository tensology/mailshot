// Base64 file attachments for the integration draft API (JSON body).
// Each item: { filename, content_type | contentType | mimeType, content | content_base64 }.
// Decoded items are shaped like multer files so saveDraftEmail stores them exactly like UI uploads.
export const DRAFT_ATTACHMENT_LIMITS = Object.freeze({
    maxFiles: 10,
    maxFileBytes: 10 * 1024 * 1024,
    maxTotalBytes: 15 * 1024 * 1024,
    maxFilenameLength: 180
});

export const ALLOWED_ATTACHMENT_TYPES = Object.freeze([
    'application/pdf',
    'text/plain', 'text/csv', 'text/markdown', 'text/calendar',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

const EXTENSION_TYPES = Object.freeze({
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', ics: 'text/calendar',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', zip: 'application/zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});

const MAGIC = Object.freeze({
    'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
    'image/png': [0x89, 0x50, 0x4e, 0x47],
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/gif': [0x47, 0x49, 0x46, 0x38],
    'application/zip': [0x50, 0x4b],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4b],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [0x50, 0x4b],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': [0x50, 0x4b]
});

export class DraftAttachmentError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
        this.code = 'invalid_attachment';
    }
}

const fail = (message) => { throw new DraftAttachmentError(message); };

export const sanitizeAttachmentFilename = (value) => {
    const base = String(value || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').trim();
    if (!base || base === '.' || base === '..') return '';
    return base.slice(0, DRAFT_ATTACHMENT_LIMITS.maxFilenameLength);
};

const decodeBase64 = (value, filename) => {
    const text = String(value || '').replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
    if (!text) fail(`Attachment "${filename}" has no content.`);
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(text) || text.length % 4 === 1) fail(`Attachment "${filename}" is not valid base64.`);
    const estimated = Math.floor((text.length * 3) / 4);
    if (estimated > DRAFT_ATTACHMENT_LIMITS.maxFileBytes + 3) fail(`Attachment "${filename}" exceeds ${DRAFT_ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)}MB.`);
    return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

export const parseDraftAttachments = (input) => {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) fail('attachments must be a list of {filename, content_type, content(base64)} objects.');
    if (input.length > DRAFT_ATTACHMENT_LIMITS.maxFiles) fail(`At most ${DRAFT_ATTACHMENT_LIMITS.maxFiles} attachments per request.`);
    let total = 0;
    return input.map((item, index) => {
        if (!item || typeof item !== 'object') fail(`Attachment ${index + 1} must be an object.`);
        const filename = sanitizeAttachmentFilename(item.filename || item.name);
        if (!filename) fail(`Attachment ${index + 1} needs a filename.`);
        const extension = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
        const declared = String(item.content_type || item.contentType || item.mimeType || item.mimetype || '').split(';')[0].trim().toLowerCase();
        const contentType = declared || EXTENSION_TYPES[extension] || '';
        if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) fail(`Attachment "${filename}" has an unsupported type (${contentType || 'unknown'}).`);
        if (EXTENSION_TYPES[extension] && EXTENSION_TYPES[extension] !== contentType) fail(`Attachment "${filename}" extension does not match type ${contentType}.`);
        const buffer = decodeBase64(item.content ?? item.content_base64 ?? item.data, filename);
        if (!buffer.length) fail(`Attachment "${filename}" is empty.`);
        if (buffer.length > DRAFT_ATTACHMENT_LIMITS.maxFileBytes) fail(`Attachment "${filename}" exceeds ${DRAFT_ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)}MB.`);
        const magic = MAGIC[contentType];
        if (magic && !magic.every((byte, offset) => buffer[offset] === byte)) fail(`Attachment "${filename}" content does not look like ${contentType}.`);
        total += buffer.length;
        if (total > DRAFT_ATTACHMENT_LIMITS.maxTotalBytes) fail(`Attachments exceed ${DRAFT_ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)}MB in total.`);
        return { buffer, originalname: filename, mimetype: contentType, size: buffer.length };
    });
};
