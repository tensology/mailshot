import crypto from 'crypto';
import { getAuthCredentials, isAuthConfigured } from '../services/auth-config.js';
import { createSession, getSession, revokeSession } from '../services/auth-store.js';
import { isSuperUser } from '../services/settings-store.js';

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const extractToken = (request) => {
    const header = request.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    return '';
};

export const login = (request, response) => {
    const credentials = getAuthCredentials();
    if (!credentials) {
        return response.status(503).json('Authentication is not configured. Set AUTH_USERNAME/AUTH_PASSWORD or auth.config.json.');
    }

    const username = String(request.body?.username || '').trim();
    const password = String(request.body?.password || '');

    if (!username || !password) {
        return response.status(400).json('Username and password are required');
    }

    if (!safeEqual(username, credentials.username) || !safeEqual(password, credentials.password)) {
        return response.status(401).json('Invalid username or password');
    }

    const { token, session } = createSession(username);

    return response.status(200).json({
        token,
        username: session.username,
        is_superuser: isSuperUser(session.username),
        expires_at: session.expires_at
    });
};

export const getCurrentSession = (request, response) => {
    const token = extractToken(request);
    const session = getSession(token);

    if (!session) {
        return response.status(401).json('Unauthorized');
    }

    return response.status(200).json({
        username: session.username,
        is_superuser: isSuperUser(session.username),
        expires_at: session.expires_at
    });
};

export const logout = (request, response) => {
    const token = extractToken(request);
    if (token) {
        revokeSession(token);
    }

    return response.status(200).json({ ok: true });
};

export const getAuthStatus = (_, response) => {
    return response.status(200).json({
        configured: isAuthConfigured()
    });
};
