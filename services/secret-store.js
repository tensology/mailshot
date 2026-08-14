import crypto from 'crypto';

const PREFIX = 'enc:v1:';

const encryptionKey = () => {
    const secret = String(
        process.env.MAILSHOT_SETTINGS_SECRET
        || process.env.AUTH_PASSWORD
        || process.env.MAILBOX_PASSWORD
        || ''
    ).trim();
    if (!secret) return null;
    return crypto.createHash('sha256').update(secret).digest();
};

export const canEncryptSecrets = () => Boolean(encryptionKey());

export const encryptSecret = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith(PREFIX)) return raw;
    const key = encryptionKey();
    if (!key) throw new Error('MAILSHOT_SETTINGS_SECRET must be configured before saving the Tensology API key');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
};

export const decryptSecret = (value = '') => {
    const encoded = String(value || '').trim();
    if (!encoded.startsWith(PREFIX)) return encoded;
    const key = encryptionKey();
    if (!key) return '';
    try {
        const buffer = Buffer.from(encoded.slice(PREFIX.length), 'base64url');
        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const encrypted = buffer.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
        return '';
    }
};
