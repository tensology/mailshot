import fs from 'fs';
import path from 'path';
import Setting from '../model/setting.js';
import { isDbConnected } from '../database/db.js';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'app-settings.json');
const SETTINGS_KEY = 'global';
export const SUPERUSER_EMAIL = String(process.env.MAILSHOT_SUPERUSER || 'paul@tensology.com').trim().toLowerCase();

const defaultSettings = () => ({
    general: {
        email: SUPERUSER_EMAIL,
        signature_html: '',
        autoresponder_enabled: false,
        autoresponder_html: '',
        autoresponder_subject: 'Re: {{subject}}'
    },
    ai: {
        enabled: false,
        provider: 'openai',
        api_key: '',
        base_url: '',
        model: ''
    },
    autoresponder_log: []
});

let settingsCache = defaultSettings();

const mergeSettings = (value = {}) => {
    const general = {
        ...defaultSettings().general,
        ...(value.general || {})
    };

    if (String(general.email || '').trim().toLowerCase() === 'port@tensology.com') {
        general.email = SUPERUSER_EMAIL;
    }

    return {
        ...defaultSettings(),
        ...value,
        general,
        ai: {
            ...defaultSettings().ai,
            ...(value.ai || {})
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
