const CACHE_PREFIX = 'mailshot:list:';
const CACHE_TTL_MS = 30 * 60 * 1000;
const LEGACY_CACHE_ID_PATTERN = /^cache-\d+-/;

const hasLegacyCacheIds = (emails = []) => {
    return emails.some((email) => LEGACY_CACHE_ID_PATTERN.test(String(email?._id || '')));
};

const buildCacheKey = ({ activeTab, labelFilter, searchFilter, participantFilter }) => {
    return `${activeTab}|${labelFilter || ''}|${searchFilter || ''}|${participantFilter || ''}`;
};

export const readEmailListCache = ({ activeTab, labelFilter, searchFilter, participantFilter }) => {
    try {
        const key = CACHE_PREFIX + buildCacheKey({ activeTab, labelFilter, searchFilter, participantFilter });
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

export const writeEmailListCache = ({ activeTab, labelFilter, searchFilter, participantFilter }, emails) => {
    try {
        const key = CACHE_PREFIX + buildCacheKey({ activeTab, labelFilter, searchFilter, participantFilter });
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
const ACTION_NOTICE_KEY = 'mailshot:action-notice';
const ACTION_NOTICE_EVENT = 'mailshot:action-notice';
const ACTION_ERROR_EVENT = 'mailshot:action-error';

const dispatchActionMessage = (eventName, message) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: { message: String(message) }
        }));
    } catch {
        // ignore
    }
};

export const setActionError = (message) => {
    const text = String(message || 'Action failed');

    try {
        sessionStorage.setItem(ACTION_ERROR_KEY, JSON.stringify({
            message: text,
            at: Date.now()
        }));
    } catch {
        // ignore
    }

    dispatchActionMessage(ACTION_ERROR_EVENT, text);
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

export const setActionNotice = (message) => {
    const text = String(message || 'Done');

    try {
        sessionStorage.setItem(ACTION_NOTICE_KEY, JSON.stringify({
            message: text,
            at: Date.now()
        }));
    } catch {
        // ignore
    }

    dispatchActionMessage(ACTION_NOTICE_EVENT, text);
};

export const consumeActionNotice = () => {
    try {
        const raw = sessionStorage.getItem(ACTION_NOTICE_KEY);
        if (!raw) {
            return '';
        }

        sessionStorage.removeItem(ACTION_NOTICE_KEY);
        const parsed = JSON.parse(raw);
        if (!parsed?.message || Date.now() - parsed.at > 60000) {
            return '';
        }

        return parsed.message;
    } catch {
        return '';
    }
};
