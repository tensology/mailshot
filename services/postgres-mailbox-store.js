import { createPostgresPool, isPostgresConfigured } from '../database/postgres.js';
import { ensurePostgresSchema } from '../database/postgres-schema.js';
import { createMailboxRepository } from './mailbox-repository.js';
import { listAccounts, getDefaultAccountId } from './accounts-config.js';
import { getActiveAccount } from './account-context.js';

// account id -> { pool, repository }
const stores = new Map();
let defaultAccountId = null;
let ready = false;
let lastError = null;

const createStoreForAccount = async (account) => {
    const pool = createPostgresPool({ schema: account.schema });

    if (account.schema && account.schema !== 'public') {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${account.schema}"`);
    }

    await ensurePostgresSchema(pool);
    const repository = createMailboxRepository({ pool });
    return { pool, repository, account };
};

export const initializeMailboxStore = async () => {
    stores.clear();
    defaultAccountId = null;
    ready = false;
    lastError = null;

    if (!isPostgresConfigured()) {
        return { ready: false, reason: 'not-configured' };
    }

    const accounts = listAccounts();
    const failures = [];

    for (const account of accounts) {
        try {
            const store = await createStoreForAccount(account);
            stores.set(account.id, store);
            if (!defaultAccountId) {
                defaultAccountId = account.id;
            }
        } catch (error) {
            failures.push({ id: account.id, error: error.message });
            console.error(`Mailbox store init failed for account "${account.id}":`, error.message);
        }
    }

    defaultAccountId = defaultAccountId || getDefaultAccountId();

    if (!stores.size) {
        lastError = new Error(failures[0]?.error || 'no accounts initialized');
        return { ready: false, reason: lastError.message };
    }

    ready = true;
    return { ready: true, accounts: [...stores.keys()], failures };
};

const resolveStore = () => {
    const active = getActiveAccount();
    if (active && stores.has(active.id)) {
        return stores.get(active.id);
    }
    if (defaultAccountId && stores.has(defaultAccountId)) {
        return stores.get(defaultAccountId);
    }
    return [...stores.values()][0] || null;
};

export const getMailboxRepository = () => resolveStore()?.repository || null;

export const getMailboxPool = () => resolveStore()?.pool || null;

export const getAccountPool = (accountId) => stores.get(accountId)?.pool || null;

export const isMailboxStoreReady = () => ready && stores.size > 0;

export const getMailboxStoreStatus = () => ({
    ready: isMailboxStoreReady(),
    configured: isPostgresConfigured(),
    accounts: [...stores.keys()],
    error: lastError?.message || null
});

export const __setMailboxStoreForTests = ({
    pool: nextPool = null,
    repository: nextRepository = null,
    ready: nextReady = false
} = {}) => {
    stores.clear();
    if (nextPool || nextRepository) {
        stores.set('__test__', { pool: nextPool, repository: nextRepository, account: { id: '__test__' } });
    }
    defaultAccountId = nextPool || nextRepository ? '__test__' : null;
    ready = nextReady;
    lastError = null;
};
