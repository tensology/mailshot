import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data');
const SESSION_FILE = path.join(CACHE_DIR, 'auth-sessions.json');
const SESSION_TTL_MS = Number(process.env.AUTH_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const sessions = new Map();

const saveSessionsToDisk = () => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(SESSION_FILE, JSON.stringify({
            saved_at: new Date().toISOString(),
            sessions: [...sessions.entries()].map(([token, session]) => ({ token, session }))
        }));
    } catch (error) {
        console.error('Failed to save auth sessions to disk:', error.message);
    }
};

const purgeExpiredSessions = () => {
    const now = Date.now();
    let changed = false;

    for (const [token, session] of sessions.entries()) {
        if (session.expires_at <= now) {
            sessions.delete(token);
            changed = true;
        }
    }

    if (changed) {
        saveSessionsToDisk();
    }
};

export const loadSessionsFromDisk = () => {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            return 0;
        }

        const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        if (!Array.isArray(parsed?.sessions)) {
            return 0;
        }

        sessions.clear();
        parsed.sessions.forEach((entry) => {
            if (!entry?.token || !entry?.session) {
                return;
            }
            sessions.set(entry.token, entry.session);
        });

        purgeExpiredSessions();
        return sessions.size;
    } catch (error) {
        console.error('Failed to load auth sessions from disk:', error.message);
        return 0;
    }
};

loadSessionsFromDisk();

export const createSession = (username) => {
    purgeExpiredSessions();

    const token = crypto.randomBytes(32).toString('hex');
    const session = {
        username,
        created_at: Date.now(),
        expires_at: Date.now() + SESSION_TTL_MS
    };

    sessions.set(token, session);
    saveSessionsToDisk();
    return { token, session };
};

export const getSession = (token) => {
    if (!token) {
        return null;
    }

    purgeExpiredSessions();

    const session = sessions.get(token);
    if (!session) {
        return null;
    }

    if (session.expires_at <= Date.now()) {
        sessions.delete(token);
        saveSessionsToDisk();
        return null;
    }

    return session;
};

export const revokeSession = (token) => {
    if (!token) {
        return;
    }

    sessions.delete(token);
    saveSessionsToDisk();
};
