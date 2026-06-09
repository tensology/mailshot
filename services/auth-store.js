import crypto from 'crypto';

const sessions = new Map();
const SESSION_TTL_MS = Number(process.env.AUTH_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const purgeExpiredSessions = () => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (session.expires_at <= now) {
            sessions.delete(token);
        }
    }
};

export const createSession = (username) => {
    purgeExpiredSessions();

    const token = crypto.randomBytes(32).toString('hex');
    const session = {
        username,
        created_at: Date.now(),
        expires_at: Date.now() + SESSION_TTL_MS
    };

    sessions.set(token, session);
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
        return null;
    }

    return session;
};

export const revokeSession = (token) => {
    sessions.delete(token);
};
