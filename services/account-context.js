import { AsyncLocalStorage } from 'async_hooks';

// Carries the active account through an async request / sync run so the store
// layer can resolve the right Postgres pool + repository without threading an
// account argument through every controller.
const storage = new AsyncLocalStorage();

export const runWithAccount = (account, fn) => storage.run({ account }, fn);

export const getActiveAccount = () => storage.getStore()?.account || null;

export const getActiveAccountId = () => getActiveAccount()?.id || null;
