import { AsyncLocalStorage } from 'async_hooks';

// Carries the active account through an async request / sync run so the store
// layer can resolve the right Postgres pool + repository without threading an
// account argument through every controller.
const storage = new AsyncLocalStorage();

export const runWithAccount = (account, fn) => storage.run({ account }, fn);

// enterWith persists for the remainder of the current async execution context,
// which survives Express middleware hand-offs (including async body parsers
// such as multer) where run() alone can lose the store.
export const enterAccount = (account) => storage.enterWith({ account });

export const getActiveAccount = () => storage.getStore()?.account || null;

export const getActiveAccountId = () => getActiveAccount()?.id || null;
