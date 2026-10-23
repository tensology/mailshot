import fs from 'fs';

// Sender identities ("From" addresses) Mailshot knows about.
// - The primary identity is the SMTP mailbox (MAIL_FROM / MAILBOX_USER) and is the only one that can send.
// - Extra identities come from config/sender-identities.json (or MAILSHOT_SENDER_IDENTITIES_FILE) and
//   MAILSHOT_SENDER_IDENTITIES (comma-separated). They can carry a draft's From; they can only send when
//   can_send is true AND the SMTP server accepts that address (not the case by default).
const DEFAULT_CONFIG_URL = new URL('../config/sender-identities.json', import.meta.url);

export const extractAddress = (value = '') => {
    const text = String(value || '').trim();
    const angle = text.match(/<([^<>\s]+@[^<>\s]+)>/);
    const candidate = (angle ? angle[1] : text).trim().toLowerCase();
    return /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/.test(candidate) ? candidate : '';
};

const readConfigFile = (env, readFile) => {
    const location = env.MAILSHOT_SENDER_IDENTITIES_FILE || DEFAULT_CONFIG_URL;
    try {
        const parsed = JSON.parse(readFile(location, 'utf8'));
        return Array.isArray(parsed?.identities) ? parsed.identities : [];
    } catch {
        return [];
    }
};

export const loadSenderIdentities = ({ env = process.env, readFile = fs.readFileSync } = {}) => {
    const identities = [];
    const seen = new Set();
    const add = (entry, defaults = {}) => {
        const email = extractAddress(entry?.email);
        if (!email || seen.has(email)) return;
        seen.add(email);
        identities.push({
            email,
            name: String(entry?.name || ''),
            primary: Boolean(defaults.primary),
            can_send: defaults.primary ? true : entry?.can_send === true,
            note: String(entry?.note || '')
        });
    };
    add({ email: env.MAIL_FROM || env.MAILBOX_USER || env.MAIL_USERNAME, name: env.MAIL_NAME || '' }, { primary: true });
    readConfigFile(env, readFile).forEach((entry) => add(entry));
    String(env.MAILSHOT_SENDER_IDENTITIES || '').split(',').forEach((email) => add({ email }));
    return identities;
};

export const findSenderIdentity = (value, identities = loadSenderIdentities()) => {
    const email = extractAddress(value);
    return email ? identities.find((identity) => identity.email === email) || null : null;
};

export const formatSender = (identity) => (identity.name ? `"${identity.name.replace(/"/g, '')}" <${identity.email}>` : identity.email);
