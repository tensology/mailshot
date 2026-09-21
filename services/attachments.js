import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ATTACHMENTS_DIR = path.resolve(path.join(__dirname, '..', 'storage', 'attachments'));

const ensureAttachmentsDir = () => {
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
        fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    }
};

const resolveWithinAttachments = (storagePath) => {
    if (!storagePath) {
        return null;
    }

    const resolved = path.resolve(String(storagePath));
    const root = ATTACHMENTS_DIR.endsWith(path.sep) ? ATTACHMENTS_DIR : `${ATTACHMENTS_DIR}${path.sep}`;
    if (resolved !== ATTACHMENTS_DIR && !resolved.startsWith(root)) {
        return null;
    }

    return resolved;
};

export const sanitizeContentDispositionFilename = (filename = 'attachment') => (
    String(filename || 'attachment')
        .replace(/[\r\n"\\]/g, '_')
        .replace(/[^\w.\- ()[\]]+/g, '_')
        .slice(0, 180) || 'attachment'
);

export const buildContentDisposition = (disposition = 'attachment', filename = 'attachment') => {
    const safe = sanitizeContentDispositionFilename(filename);
    const encoded = encodeURIComponent(safe).replace(/['()]/g, escape);
    return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
};

export const saveAttachmentFromBuffer = (buffer, { filename, content_type }) => {
    ensureAttachmentsDir();
    const attachmentId = randomUUID();
    const safeName = String(filename || 'attachment').replace(/[^\w.\-]/g, '_');
    const storagePath = path.join(ATTACHMENTS_DIR, `${attachmentId}-${safeName}`);
    fs.writeFileSync(storagePath, buffer);

    return {
        attachment_id: attachmentId,
        filename: filename || 'attachment',
        content_type: content_type || 'application/octet-stream',
        size: buffer.length,
        storage_path: storagePath
    };
};

export const readAttachmentFile = (storagePath) => {
    const resolved = resolveWithinAttachments(storagePath);
    if (!resolved || !fs.existsSync(resolved)) {
        return null;
    }
    return fs.readFileSync(resolved);
};

export const deleteAttachmentFile = (storagePath) => {
    const resolved = resolveWithinAttachments(storagePath);
    if (resolved && fs.existsSync(resolved)) {
        fs.unlinkSync(resolved);
    }
};

export const parseMailAttachments = (parsedAttachments = []) => {
    return parsedAttachments
        .filter((item) => !item.related && item.content)
        .map((item) => saveAttachmentFromBuffer(item.content, {
            filename: item.filename,
            content_type: item.contentType
        }));
};
