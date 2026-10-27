import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Multi-account + multi-user registry.
//
// Stored server-local in accounts.config.json (gitignored, holds mailbox
// secrets). When the file is absent Mailshot falls back to the legacy
// single-mailbox env configuration so existing deployments keep working.
const CONFIG_FILE = process.env.MAILSHOT_ACCOUNTS_FILE
    ? path.resolve(process.env.MAILSHOT_ACCOUNTS_FILE)
    : path.resolve(process.cwd(), 'accounts.config.json');

const DEFAULT_ACCOUNT_ID = 'default';

const slug = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const normalizeSchema = (value, fallbackId) => {
    const raw = String(value || '').trim().toLowerCase();
    if (/^[a-z_][a-z0-9_]*$/.test(raw)) {
        return raw;
    }
    return `acct_${slug(fallbackId) || DEFAULT_ACCOUNT_ID}`.replace(/-/g, '_');
};

const normalizeEmail = (value = '') => {
    const raw = String(value || '').trim();
    const inner = /<([^>]+)>/.exec(raw)?.[1] || raw;
    return inner.trim();
};

const normalizeAccount = (entry = {}, index = 0) => {
    const id = slug(entry.id || entry.email || `account-${index + 1}`) || `account-${index + 1}`;
    const email = normalizeEmail(entry.email || entry.smtp?.from || entry.imap?.user || '');
    const imap = entry.imap || {};
    const smtp = entry.smtp || {};

    return {
        id,
        label: String(entry.label || entry.name || email || id),
        name: String(entry.name || '').trim(),
        email,
        logo: String(entry.logo || entry.icon || '').trim(),
        schema: normalizeSchema(entry.schema, id),
        imap: {
            host: String(imap.host || process.env.MAIL_IMAP_HOST || '').trim(),
            port: Number(imap.port || process.env.MAIL_IMAP_PORT || 993),
            secure: imap.secure !== false,
            user: String(imap.user || '').trim(),
            password: String(imap.password || '')
        },
        smtp: {
            host: String(smtp.host || process.env.MAIL_SMTP_HOST || '').trim(),
            port: Number(smtp.port || process.env.MAIL_SMTP_PORT || 587),
            secure: String(smtp.secure ?? process.env.MAIL_SMTP_SECURE ?? 'false').toLowerCase() === 'true',
            user: String(smtp.user || '').trim(),
            password: String(smtp.password || ''),
            from: normalizeEmail(smtp.from || email || ''),
            fromName: String(smtp.from_name || smtp.fromName || entry.name || '').trim(),
            rejectUnauthorized: String(smtp.reject_unauthorized ?? process.env.MAIL_SMTP_REJECT_UNAUTHORIZED ?? 'true').toLowerCase() === 'true'
        }
    };
};

const envFallbackAccount = () => normalizeAccount({
    id: DEFAULT_ACCOUNT_ID,
    label: process.env.MAIL_NAME ? `${process.env.MAIL_NAME}` : 'Mailbox',
    name: process.env.MAIL_NAME || '',
    email: process.env.MAIL_FROM || process.env.MAILBOX_USER || '',
    schema: 'public',
    imap: {
        host: process.env.MAIL_IMAP_HOST,
        port: process.env.MAIL_IMAP_PORT,
        secure: true,
        user: process.env.MAILBOX_USER || process.env.MAIL_IMAP_USERNAME || process.env.MAIL_USERNAME,
        password: process.env.MAILBOX_PASSWORD || process.env.MAIL_IMAP_PASSWORD || process.env.MAIL_PASSWORD
    },
    smtp: {
        host: process.env.MAIL_SMTP_HOST,
        port: process.env.MAIL_SMTP_PORT,
        secure: process.env.MAIL_SMTP_SECURE,
        user: process.env.MAILBOX_USER || process.env.MAIL_USERNAME || process.env.MAIL_IMAP_USERNAME,
        password: process.env.MAILBOX_PASSWORD || process.env.MAIL_PASSWORD || process.env.MAIL_IMAP_PASSWORD,
        from: process.env.MAIL_FROM || process.env.MAILBOX_USER,
        from_name: process.env.MAIL_NAME,
        reject_unauthorized: process.env.MAIL_SMTP_REJECT_UNAUTHORIZED
    }
}, 0);

let configCache = null;
let configMtime = 0;

const readRaw = () => {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            return null;
        }
        const stat = fs.statSync(CONFIG_FILE);
        if (configCache && stat.mtimeMs === configMtime) {
            return configCache;
        }
        const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        configCache = parsed;
        configMtime = stat.mtimeMs;
        return parsed;
    } catch (error) {
        console.error('Failed to read accounts.config.json:', error.message);
        return configCache;
    }
};

const buildState = () => {
    const raw = readRaw();
    const accounts = [];
    const seen = new Set();

    const pushAccount = (entry, index) => {
        const account = normalizeAccount(entry, index);
        if (seen.has(account.id)) {
            return;
        }
        seen.add(account.id);
        accounts.push(account);
    };

    if (Array.isArray(raw?.accounts) && raw.accounts.length) {
        raw.accounts.forEach(pushAccount);
    } else {
        pushAccount(envFallbackAccount(), 0);
    }

    const users = [];
    const seenUsers = new Set();
    const configuredUsers = Array.isArray(raw?.users) ? raw.users : [];
    configuredUsers.forEach((entry, index) => {
        const username = String(entry?.username || entry?.email || '').trim().toLowerCase();
        if (!username || seenUsers.has(username)) {
            return;
        }
        seenUsers.add(username);
        const accountIds = Array.isArray(entry.accounts) && entry.accounts.length
            ? entry.accounts.map((value) => slug(value)).filter((value) => seen.has(value))
            : accounts.map((account) => account.id);
        users.push({
            username,
            name: String(entry.name || '').trim(),
            password: String(entry.password || ''),
            is_superuser: Boolean(entry.is_superuser),
            must_change_password: Boolean(entry.must_change_password),
            accountIds: accountIds.length ? accountIds : accounts.map((account) => account.id)
        });
    });

    if (!users.length) {
        const username = String(process.env.AUTH_USERNAME || '').trim().toLowerCase();
        const password = String(process.env.AUTH_PASSWORD || '');
        if (username && password) {
            users.push({
                username,
                name: process.env.MAIL_NAME || '',
                password,
                is_superuser: true,
                accountIds: accounts.map((account) => account.id)
            });
        }
    }

    return { accounts, users, multiAccount: accounts.length > 1 };
};

export const getAccountsState = () => buildState();

export const isMultiAccountConfigured = () => getAccountsState().multiAccount;

export const listAccounts = () => getAccountsState().accounts;

export const getAccount = (id) => (
    getAccountsState().accounts.find((account) => account.id === slug(id)) || null
);

export const getDefaultAccountId = () => getAccountsState().accounts[0]?.id || null;

export const findUser = (username) => {
    const normalized = String(username || '').trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    return getAccountsState().users.find((user) => user.username === normalized) || null;
};

export const accountsForUser = (username) => {
    const user = findUser(username);
    if (!user) {
        return [];
    }
    const accounts = getAccountsState().accounts;
    return user.accountIds
        .map((id) => accounts.find((account) => account.id === id))
        .filter(Boolean);
};

export const isSuperUser = (username) => Boolean(findUser(username)?.is_superuser);

// Rewrites the user's password in accounts.config.json and clears the
// must-change flag. Secrets stay server-local; the file is gitignored.
export const updateUserPassword = (username, newPassword) => {
    const normalized = String(username || '').trim().toLowerCase();
    const password = String(newPassword || '');
    if (!normalized || !password) {
        throw new Error('Username and password are required');
    }
    if (!fs.existsSync(CONFIG_FILE)) {
        throw new Error('Password changes are not available on this deployment');
    }

    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const users = Array.isArray(raw.users) ? raw.users : [];
    const target = users.find((entry) => (
        String(entry.username || entry.email || '').trim().toLowerCase() === normalized
    ));
    if (!target) {
        throw new Error('User not found');
    }

    target.password = password;
    delete target.must_change_password;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 2));

    // Drop the cached copy so the next read picks up the new password.
    configCache = null;
    configMtime = 0;
    return true;
};

export const publicAccount = (account) => ({
    id: account.id,
    label: account.label,
    name: account.name,
    email: account.email,
    logo: account.logo || ''
});

export const accountVersion = () => configMtime;

export { CONFIG_FILE };
