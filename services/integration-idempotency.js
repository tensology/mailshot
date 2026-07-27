import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'integration-idempotency.json');
let records = {};
try {
    records = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch {}

const persist = () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(records));
};

export const runIdempotent = async (request, action, operation) => {
    const key = String(request.headers['idempotency-key'] || '').trim();
    if (!key) {
        const error = new Error('Idempotency-Key is required');
        error.status = 400;
        throw error;
    }
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(request.body || {})).digest('hex');
    const recordKey = `${action}:${key}`;
    if (records[recordKey]) {
        if (records[recordKey].bodyHash !== bodyHash) {
            const error = new Error('Idempotency-Key was already used with a different request');
            error.status = 409;
            throw error;
        }
        return { ...records[recordKey], replay: true };
    }
    const result = await operation();
    records[recordKey] = { ...result, bodyHash, savedAt: new Date().toISOString() };
    persist();
    return records[recordKey];
};
