import { createPostgresPool, isPostgresConfigured } from '../database/postgres.js';
import { ensurePostgresSchema } from '../database/postgres-schema.js';
import { createMailboxRepository } from './mailbox-repository.js';

let pool = null;
let repository = null;
let ready = false;
let lastError = null;

export const initializeMailboxStore = async () => {
    if (!isPostgresConfigured()) {
        ready = false;
        repository = null;
        return { ready: false, reason: 'not-configured' };
    }

    try {
        pool = createPostgresPool();
        await ensurePostgresSchema(pool);
        repository = createMailboxRepository({ pool });
        ready = true;
        lastError = null;
        return { ready: true };
    } catch (error) {
        ready = false;
        repository = null;
        lastError = error;
        return { ready: false, reason: error.message };
    }
};

export const getMailboxRepository = () => repository;

export const getMailboxPool = () => pool;

export const isMailboxStoreReady = () => ready && Boolean(repository);

export const getMailboxStoreStatus = () => ({
    ready: isMailboxStoreReady(),
    configured: isPostgresConfigured(),
    error: lastError?.message || null
});

export const __setMailboxStoreForTests = ({ repository: nextRepository = null, ready: nextReady = false } = {}) => {
    repository = nextRepository;
    ready = nextReady;
    lastError = null;
};
