/**
 * In-memory sliding-window rate limiter (single process).
 * ponytail: process-local only; multi-instance would need shared store.
 */

const buckets = new Map();

const getBucket = (key) => {
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
    }
    return bucket;
};

const prune = (bucket, windowMs, now = Date.now()) => {
    const cutoff = now - windowMs;
    while (bucket.length && bucket[0] < cutoff) {
        bucket.shift();
    }
};

export const clearRateLimitBuckets = () => {
    buckets.clear();
};

export const checkRateLimit = ({
    key,
    limit,
    windowMs,
    now = Date.now()
} = {}) => {
    const max = Math.max(1, Number(limit) || 1);
    const window = Math.max(1000, Number(windowMs) || 60_000);
    const bucket = getBucket(String(key || 'default'));
    prune(bucket, window, now);

    if (bucket.length >= max) {
        const retryAfterMs = Math.max(0, (bucket[0] + window) - now);
        return {
            allowed: false,
            remaining: 0,
            retry_after_ms: retryAfterMs,
            count: bucket.length,
            limit: max
        };
    }

    bucket.push(now);
    return {
        allowed: true,
        remaining: Math.max(0, max - bucket.length),
        retry_after_ms: 0,
        count: bucket.length,
        limit: max
    };
};

export const countRecipients = (...fields) => {
    const emails = new Set();
    fields.forEach((field) => {
        String(field || '')
            .split(/[,;]+/)
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => emails.add(part.toLowerCase()));
    });
    return emails.size;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const assertOutboundSendAllowed = ({
    actor = 'session',
    to = '',
    cc = '',
    bcc = '',
    now = Date.now()
} = {}) => {
    const maxRecipients = Number(process.env.MAIL_SEND_MAX_RECIPIENTS || 50);
    const hourLimit = Number(process.env.MAIL_SEND_HOUR_LIMIT || 30);
    const dayLimit = Number(process.env.MAIL_SEND_DAY_LIMIT || 100);
    const recipientCount = countRecipients(to, cc, bcc);

    if (recipientCount < 1) {
        return { ok: false, status: 400, message: 'At least one recipient is required' };
    }

    if (recipientCount > maxRecipients) {
        return {
            ok: false,
            status: 400,
            message: `Too many recipients (${recipientCount}). Max is ${maxRecipients}.`
        };
    }

    const hour = checkRateLimit({
        key: `send:hour:${actor}`,
        limit: hourLimit,
        windowMs: HOUR_MS,
        now
    });
    if (!hour.allowed) {
        return {
            ok: false,
            status: 429,
            message: `Send rate limit exceeded (${hourLimit}/hour). Try again later.`,
            retry_after_ms: hour.retry_after_ms
        };
    }

    const day = checkRateLimit({
        key: `send:day:${actor}`,
        limit: dayLimit,
        windowMs: DAY_MS,
        now
    });
    if (!day.allowed) {
        return {
            ok: false,
            status: 429,
            message: `Send rate limit exceeded (${dayLimit}/day). Try again later.`,
            retry_after_ms: day.retry_after_ms
        };
    }

    return { ok: true, recipient_count: recipientCount };
};
