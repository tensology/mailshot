import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACHMENTS_DIR = path.join(__dirname, '..', 'storage', 'attachments');

const ensureAttachmentsDir = () => {
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
        fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    }
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
    if (!storagePath || !fs.existsSync(storagePath)) {
        return null;
    }
    return fs.readFileSync(storagePath);
};

export const deleteAttachmentFile = (storagePath) => {
    if (storagePath && fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
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
