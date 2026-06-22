const readEnv = (key, fallback = '') => {
    const viteValue = import.meta.env[`VITE_${key}`];
    if (viteValue !== undefined && viteValue !== '') {
        return viteValue;
    }

    const craValue = import.meta.env[`REACT_APP_${key}`];
    if (craValue !== undefined && craValue !== '') {
        return craValue;
    }

    return fallback;
};

export const API_URL = readEnv('API_URL', '');
export const MAIL_FROM = readEnv('MAIL_FROM', '');
export const MAILBOX_USER = readEnv('MAILBOX_USER', 'Me');
