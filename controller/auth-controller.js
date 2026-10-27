import crypto from 'crypto';
import { findUser, accountsForUser, publicAccount, isSuperUser, updateUserPassword } from '../services/accounts-config.js';
import { isAuthConfigured } from '../services/auth-config.js';
import { createSession, getSession, revokeSession } from '../services/auth-store.js';
import {
    clearLoginFailures,
    getClientIp,
    getLoginLockoutStatus,
    recordLoginFailure
} from '../services/login-lockout.js';

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

const sessionPayload = (username) => {
    const accounts = accountsForUser(username).map(publicAccount);
    return {
        username,
        name: findUser(username)?.name || '',
        is_superuser: isSuperUser(username),
        must_change_password: Boolean(findUser(username)?.must_change_password),
        accounts,
        default_account_id: accounts[0]?.id || null
    };
};

export const login = (request, response) => {
    if (!isAuthConfigured()) {
        return response.status(503).json('Authentication is not configured. Set accounts.config.json or AUTH_USERNAME/AUTH_PASSWORD.');
    }

    const username = String(request.body?.username || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    const ip = getClientIp(request);

    if (!username || !password) {
        return response.status(400).json('Username and password are required');
    }

    const lockout = getLoginLockoutStatus(username, ip);
    if (lockout.locked) {
        const seconds = Math.ceil(lockout.remaining_ms / 1000);
        response.setHeader('Retry-After', String(seconds));
        return response.status(429).json(`Too many failed login attempts. Try again in ${seconds}s.`);
    }

    const user = findUser(username);
    if (!user || !safeEqual(password, user.password)) {
        const next = recordLoginFailure(username, ip);
        if (next.locked) {
            const seconds = Math.ceil(next.remaining_ms / 1000);
            response.setHeader('Retry-After', String(seconds));
            return response.status(429).json(`Too many failed login attempts. Try again in ${seconds}s.`);
        }
        return response.status(401).json('Invalid username or password');
    }

    clearLoginFailures(username, ip);
    const { token, session } = createSession(user.username);

    return response.status(200).json({
        token,
        ...sessionPayload(session.username),
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
        ...sessionPayload(session.username),
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

export const changePassword = (request, response) => {
    const username = request.auth?.username;
    if (!username) {
        return response.status(401).json('Unauthorized');
    }

    const newPassword = String(request.body?.new_password || '');
    const confirmPassword = String(request.body?.confirm_password || '');

    if (newPassword.length < 6) {
        return response.status(400).json('Choose a password of at least 6 characters');
    }
    if (newPassword !== confirmPassword) {
        return response.status(400).json('The two passwords do not match');
    }

    try {
        updateUserPassword(username, newPassword);
    } catch (error) {
        return response.status(400).json(error.message || 'Could not update the password');
    }

    return response.status(200).json({ ok: true });
};
