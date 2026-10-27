import { getSession } from '../services/auth-store.js';
import { isAuthConfigured } from '../services/auth-config.js';
import { getAccount, accountsForUser } from '../services/accounts-config.js';
import { enterAccount } from '../services/account-context.js';

const extractToken = (request) => {
    const header = request.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    return '';
};

export const requireAuth = (request, response, next) => {
    if (!isAuthConfigured()) {
        return response.status(503).json('Authentication is not configured');
    }

    const token = extractToken(request);
    const session = getSession(token);

    if (!session) {
        return response.status(401).json('Unauthorized');
    }

    const allowed = accountsForUser(session.username);
    if (!allowed.length) {
        return response.status(403).json('No mailbox accounts are assigned to this user');
    }

    const requestedId = String(
        request.headers['x-account-id'] || request.query?.account_id || ''
    ).trim();

    let account = requestedId ? getAccount(requestedId) : null;
    if (account && !allowed.some((entry) => entry.id === account.id)) {
        account = null;
    }
    account = account || allowed[0];

    request.auth = {
        username: session.username,
        token,
        accountId: account.id
    };
    request.account = account;

    enterAccount(account);
    return next();
};

// Re-establish the account context after an async body parser (multer) hands
// off, because that hand-off creates a fresh async context.
export const requireAccountContext = (request, response, next) => {
    if (request.account) {
        enterAccount(request.account);
    }
    return next();
};
