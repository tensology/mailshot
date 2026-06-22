import fs from 'fs';
import path from 'path';
import Setting from '../model/setting.js';
import { isDbConnected } from '../database/db.js';
import { providerDefaults } from './ai-provider.js';
import { isMailboxStoreReady, getMailboxPool } from './postgres-mailbox-store.js';
import { createPostgresSettingsStore } from './postgres-metadata-store.js';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'app-settings.json');
const SETTINGS_KEY = 'global';
export const SUPERUSER_EMAIL = String(process.env.MAILSHOT_SUPERUSER || 'you@example.com').trim().toLowerCase();

const defaultSettings = () => ({
    general: {
        email: SUPERUSER_EMAIL,
        selected_email: SUPERUSER_EMAIL,
        signatures: [
            {
                email: SUPERUSER_EMAIL,
                signature_html: ''
            }
        ],
        autoresponders: [
            {
                email: SUPERUSER_EMAIL,
                enabled: false,
                html: '',
                subject: 'Re: {{subject}}'
            }
        ],
        signature_html: '',
        autoresponder_enabled: false,
        autoresponder_html: '',
        autoresponder_subject: 'Re: {{subject}}'
    },
    ai: {
        enabled: false,
        provider: 'nvidia',
        api_key: '',
        api_keys: {},
        model: '',
        summary_provider: 'nvidia',
        summary_api_key: '',
        summary_model: ''
    },
    tts: {
        voice: process.env.KOKORO_VOICE || 'af_heart'
    },
    autoresponder_log: []
});

let settingsCache = defaultSettings();
let postgresSettingsStore = null;

const getCachedSettings = () => settingsCache;

const getPostgresSettingsStore = () => {
    if (!isMailboxStoreReady()) {
        return null;
    }

    if (!postgresSettingsStore) {
        postgresSettingsStore = createPostgresSettingsStore({
            pool: getMailboxPool(),
            getCachedSettings
        });
    }

    return postgresSettingsStore;
};

const normalizeEmail = (value = '') => {
    const raw = String(value || '').trim().toLowerCase();
    const email = (/<([^>]+)>/.exec(raw)?.[1] || raw).trim();
    return email;
};

const normalizeSignatureEntries = (general = {}) => {
    const legacyEmail = normalizeEmail(general.email) || SUPERUSER_EMAIL;
    const source = Array.isArray(general.signatures) && general.signatures.length
        ? general.signatures
        : [{ email: legacyEmail, signature_html: general.signature_html || '' }];

    const byEmail = new Map();
    source.forEach((entry = {}) => {
        const email = normalizeEmail(entry.email);
        if (!email) return;
        byEmail.set(email, {
            email,
            signature_html: String(entry.signature_html || '')
        });
    });

    if (!byEmail.size) {
        byEmail.set(SUPERUSER_EMAIL, { email: SUPERUSER_EMAIL, signature_html: '' });
    }

    return [...byEmail.values()];
};

const normalizeAutoresponderEntries = (general = {}) => {
    const legacyEmail = normalizeEmail(general.email) || SUPERUSER_EMAIL;
    const source = Array.isArray(general.autoresponders) && general.autoresponders.length
        ? general.autoresponders
        : [{
            email: legacyEmail,
            enabled: Boolean(general.autoresponder_enabled),
            html: general.autoresponder_html || '',
            subject: general.autoresponder_subject || 'Re: {{subject}}'
        }];

    const byEmail = new Map();
    source.forEach((entry = {}) => {
        const email = normalizeEmail(entry.email);
        if (!email) return;
        byEmail.set(email, {
            email,
            enabled: Boolean(entry.enabled),
            html: String(entry.html || entry.autoresponder_html || ''),
            subject: String(entry.subject || entry.autoresponder_subject || 'Re: {{subject}}').trim() || 'Re: {{subject}}'
        });
    });

    if (!byEmail.size) {
        byEmail.set(SUPERUSER_EMAIL, {
            email: SUPERUSER_EMAIL,
            enabled: false,
            html: '',
            subject: 'Re: {{subject}}'
        });
    }

    return [...byEmail.values()];
};

export const findSettingsForEmail = (general = {}, address = '') => {
    const wanted = normalizeEmail(address);
    const selected = normalizeEmail(general.selected_email || general.email) || SUPERUSER_EMAIL;
    const signatures = normalizeSignatureEntries(general);
    const autoresponders = normalizeAutoresponderEntries(general);

    return {
        signature: signatures.find((entry) => entry.email === wanted)
            || signatures.find((entry) => entry.email === selected)
            || signatures[0],
        autoresponder: autoresponders.find((entry) => entry.email === wanted)
            || autoresponders.find((entry) => entry.email === selected)
            || autoresponders[0]
    };
};

const mergeSettings = (value = {}) => {
    const rawGeneral = {
        ...defaultSettings().general,
        ...(value.general || {})
    };

    const signatures = normalizeSignatureEntries(rawGeneral);
    const autoresponders = normalizeAutoresponderEntries(rawGeneral);
    const selectedEmail = normalizeEmail(rawGeneral.selected_email || rawGeneral.email) || signatures[0]?.email || SUPERUSER_EMAIL;
    const selectedSettings = findSettingsForEmail({ ...rawGeneral, signatures, autoresponders, selected_email: selectedEmail }, selectedEmail);
    const general = {
        ...rawGeneral,
        email: selectedEmail,
        selected_email: selectedEmail,
        signatures,
        autoresponders,
        signature_html: selectedSettings.signature?.signature_html || '',
        autoresponder_enabled: Boolean(selectedSettings.autoresponder?.enabled),
        autoresponder_html: selectedSettings.autoresponder?.html || '',
        autoresponder_subject: selectedSettings.autoresponder?.subject || 'Re: {{subject}}'
    };

    const rawAi = {
        ...defaultSettings().ai,
        ...(value.ai || {})
    };
    const provider = providerDefaults[rawAi.provider] ? rawAi.provider : 'openai';
    const apiKeys = {
        ...(rawAi.api_keys || {}),
        ...(rawAi.api_key ? { [provider]: rawAi.api_key } : {})
    };

    return {
        ...defaultSettings(),
        ...value,
        general,
        ai: {
            enabled: Boolean(rawAi.enabled),
            provider,
            api_key: String(apiKeys[provider] || ''),
            api_keys: apiKeys,
            model: String(rawAi.model || ''),
            summary_provider: providerDefaults[rawAi.summary_provider] ? rawAi.summary_provider : 'nvidia',
            summary_api_key: String(rawAi.summary_api_key || ''),
            summary_model: String(rawAi.summary_model || '')
        },
        tts: {
            ...defaultSettings().tts,
            ...(value.tts || {}),
            voice: String(value.tts?.voice || defaultSettings().tts.voice || 'af_heart').trim() || 'af_heart'
        },
        autoresponder_log: Array.isArray(value.autoresponder_log) ? value.autoresponder_log : []
    };
};

export const isSuperUser = (username = '') => String(username || '').trim().toLowerCase() === SUPERUSER_EMAIL;

export const loadSettingsFromDisk = () => {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return 0;
        }

        settingsCache = mergeSettings(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))?.settings || {});
        return 1;
    } catch (error) {
        console.error('Failed to load app settings from disk:', error.message);
        return 0;
    }
};

export const saveSettingsToDisk = () => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            saved_at: new Date().toISOString(),
            settings: settingsCache
        }));
        return true;
    } catch (error) {
        console.error('Failed to save app settings to disk:', error.message);
        return false;
    }
};

export const getSettings = async () => {
    const postgresStore = getPostgresSettingsStore();
    if (postgresStore) {
        settingsCache = mergeSettings(await postgresStore.get());
        return settingsCache;
    }

    if (isDbConnected()) {
        const doc = await Setting.findOne({ key: SETTINGS_KEY });
        if (doc?.value) {
            settingsCache = mergeSettings(doc.value);
            return settingsCache;
        }
    }

    return settingsCache;
};

export const saveSettings = async (nextSettings = {}) => {
    settingsCache = mergeSettings(nextSettings);
    const postgresStore = getPostgresSettingsStore();
    if (postgresStore) {
        settingsCache = mergeSettings(await postgresStore.save(settingsCache));
        saveSettingsToDisk();
        return settingsCache;
    }

    if (isDbConnected()) {
        await Setting.findOneAndUpdate(
            { key: SETTINGS_KEY },
            { $set: { value: settingsCache }},
            { upsert: true, new: true }
        );
    }
    saveSettingsToDisk();
    return settingsCache;
};

export const updateSettingsSection = async (section, updates = {}) => {
    const current = await getSettings();
    return saveSettings({
        ...current,
        [section]: {
            ...(current[section] || {}),
            ...updates
        }
    });
};

export const markAutoresponderSent = async (messageId) => {
    if (!messageId) {
        return;
    }
    const current = await getSettings();
    const existing = Array.isArray(current.autoresponder_log) ? current.autoresponder_log : [];
    if (existing.includes(messageId)) {
        return;
    }
    await saveSettings({
        ...current,
        autoresponder_log: [...existing.slice(-499), messageId]
    });
};

loadSettingsFromDisk();
