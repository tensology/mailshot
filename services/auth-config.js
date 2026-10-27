import { getAccountsState } from './accounts-config.js';

// Authentication is considered configured when at least one user exists,
// either from accounts.config.json or the legacy AUTH_USERNAME/AUTH_PASSWORD env.
export const isAuthConfigured = () => getAccountsState().users.length > 0;

export const getAuthCredentials = () => {
    const user = getAccountsState().users[0];
    return user ? { username: user.username, password: user.password, source: 'accounts' } : null;
};
