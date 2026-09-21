/**
 * Login brute-force protection (single process).
 * ponytail: process-local Map; restart clears lockouts.
 */

const attempts = new Map();

const MAX_FAILURES = Number(process.env.AUTH_LOGIN_MAX_FAILURES || 5);
const WINDOW_MS = Number(process.env.AUTH_LOGIN_WINDOW_MS || 15 * 60 * 1000);
const LOCKOUT_MS = Number(process.env.AUTH_LOGIN_LOCKOUT_MS || 15 * 60 * 1000);

const keyFor = (username, ip) => `${String(username || '').trim().toLowerCase()}|${String(ip || 'unknown')}`;

export const clearLoginLockouts = () => {
    attempts.clear();
};

export const getClientIp = (request) => {
    const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || request.ip || request.socket?.remoteAddress || 'unknown';
};

export const getLoginLockoutStatus = (username, ip, now = Date.now()) => {
    const key = keyFor(username, ip);
    const entry = attempts.get(key);
    if (!entry) {
        return { locked: false, remaining_ms: 0, failures: 0 };
    }

    if (entry.locked_until && entry.locked_until > now) {
        return {
            locked: true,
            remaining_ms: entry.locked_until - now,
            failures: entry.failures
        };
    }

    if (entry.window_started && (now - entry.window_started) > WINDOW_MS) {
        attempts.delete(key);
        return { locked: false, remaining_ms: 0, failures: 0 };
    }

    if (entry.locked_until && entry.locked_until <= now) {
        attempts.delete(key);
        return { locked: false, remaining_ms: 0, failures: 0 };
    }

    return { locked: false, remaining_ms: 0, failures: entry.failures || 0 };
};

export const recordLoginFailure = (username, ip, now = Date.now()) => {
    const key = keyFor(username, ip);
    const current = attempts.get(key);
    let entry = current;

    if (!entry || (now - entry.window_started) > WINDOW_MS) {
        entry = { failures: 0, window_started: now, locked_until: 0 };
    }

    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
        entry.locked_until = now + LOCKOUT_MS;
    }

    attempts.set(key, entry);
    return getLoginLockoutStatus(username, ip, now);
};

export const clearLoginFailures = (username, ip) => {
    attempts.delete(keyFor(username, ip));
};
