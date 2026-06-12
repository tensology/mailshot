import { getSession } from '../services/auth-store.js';
import { isAuthConfigured } from '../services/auth-config.js';

const extractToken = (request) => {
    const header = request.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    return String(request.query.auth_token || '').trim();
};

const isBrowserNavigation = (request) => {
    if (request.method !== 'GET') {
        return false;
    }

    const acceptHeader = String(request.get('accept') || '').toLowerCase();
    const acceptsJson = acceptHeader.includes('application/json');

    return request.headers['sec-fetch-mode'] === 'navigate'
        || request.headers['sec-fetch-dest'] === 'document'
        || (acceptHeader.includes('text/html') && !acceptsJson);
};

export const requireAuth = (request, response, next) => {
    if (isBrowserNavigation(request)) {
        return next();
    }

    if (!isAuthConfigured()) {
        return response.status(503).json('Authentication is not configured');
    }

    const token = extractToken(request);
    const session = getSession(token);

    if (!session) {
        return response.status(401).json('Unauthorized');
    }

    request.auth = {
        username: session.username,
        token
    };

    return next();
};
