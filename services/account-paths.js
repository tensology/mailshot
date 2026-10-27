import path from 'path';
import { getActiveAccount } from './account-context.js';

const CACHE_ROOT = path.join(process.cwd(), 'data');

export const accountDataDir = (accountId) => {
    const id = String(accountId || getActiveAccount()?.id || 'default');
    return path.join(CACHE_ROOT, 'accounts', id);
};

export const accountCacheFile = (name, accountId) => path.join(accountDataDir(accountId), name);
