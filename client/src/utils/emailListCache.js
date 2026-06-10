const CACHE_PREFIX = 'mailshot:list:';
const CACHE_TTL_MS = 30 * 60 * 1000;
const LEGACY_CACHE_ID_PATTERN = /^cache-\d+-/;

const hasLegacyCacheIds = (emails = []) => {
    return emails.some((email) => LEGACY_CACHE_ID_PATTERN.test(String(email?._id || '')));
};

const buildCacheKey = ({ activeTab, labelFilter, searchFilter }) => {
    return `${activeTab}|${labelFilter || ''}|${searchFilter || ''}`;
};

export const readEmailListCache = ({ activeTab, labelFilter, searchFilter }) => {
    try {
        const key = CACHE_PREFIX + buildCacheKey({ activeTab, labelFilter, searchFilter });
        const raw = sessionStorage.getItem(key);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!parsed?.emails || !parsed?.saved_at) {
            return null;
        }

        if (Date.now() - parsed.saved_at > CACHE_TTL_MS) {
            sessionStorage.removeItem(key);
            return null;
        }

        if (hasLegacyCacheIds(parsed.emails)) {
            sessionStorage.removeItem(key);
            return null;
        }

        return parsed.emails;
    } catch {
        return null;
    }
};

export const writeEmailListCache = ({ activeTab, labelFilter, searchFilter }, emails) => {
    try {
        const key = CACHE_PREFIX + buildCacheKey({ activeTab, labelFilter, searchFilter });
        sessionStorage.setItem(key, JSON.stringify({
            saved_at: Date.now(),
            emails: Array.isArray(emails) ? emails : []
        }));
    } catch {
        // sessionStorage may be full or unavailable
    }
};

export const markEmailReadInCache = (emailId) => {
    try {
        Object.keys(sessionStorage).forEach((key) => {
            if (!key.startsWith(CACHE_PREFIX)) {
                return;
            }

            const raw = sessionStorage.getItem(key);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed?.emails)) {
                return;
            }

            const nextEmails = parsed.emails.map((email) => (
                email._id === emailId ? { ...email, read: true } : email
            ));

            sessionStorage.setItem(key, JSON.stringify({
                ...parsed,
                emails: nextEmails
            }));
        });
    } catch {
        // ignore cache update errors
    }
};

export const removeEmailsFromListCache = (emailIds = []) => {
    const idSet = new Set(emailIds);

    try {
        Object.keys(sessionStorage).forEach((key) => {
            if (!key.startsWith(CACHE_PREFIX)) {
                return;
            }

            const raw = sessionStorage.getItem(key);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed?.emails)) {
                return;
            }

            sessionStorage.setItem(key, JSON.stringify({
                ...parsed,
                emails: parsed.emails.filter((email) => !idSet.has(email._id))
            }));
        });
    } catch {
        // ignore cache update errors
    }
};

export const clearEmailListCache = () => {
    try {
        Object.keys(sessionStorage).forEach((key) => {
            if (key.startsWith(CACHE_PREFIX)) {
                sessionStorage.removeItem(key);
            }
        });
    } catch {
        // ignore
    }
};

const ACTION_ERROR_KEY = 'mailshot:action-error';

export const setActionError = (message) => {
    try {
        sessionStorage.setItem(ACTION_ERROR_KEY, JSON.stringify({
            message: String(message || 'Action failed'),
            at: Date.now()
        }));
    } catch {
        // ignore
    }
};

export const consumeActionError = () => {
    try {
        const raw = sessionStorage.getItem(ACTION_ERROR_KEY);
        if (!raw) {
            return '';
        }

        sessionStorage.removeItem(ACTION_ERROR_KEY);
        const parsed = JSON.parse(raw);
        if (!parsed?.message || Date.now() - parsed.at > 60000) {
            return '';
        }

        return parsed.message;
    } catch {
        return '';
    }
};
