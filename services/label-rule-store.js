import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Setting from '../model/setting.js';
import { isDbConnected } from '../database/db.js';
import { slugify } from '../utils/slug.js';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'label-rules.json');
const SETTINGS_KEY = 'label-rules';

let ruleCache = [];

export const extractEmailAddress = (value = '') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) {
        return '';
    }
    return (/<([^>]+)>/.exec(raw)?.[1] || raw).trim();
};

const normalizeRule = (rule = {}) => {
    const from = extractEmailAddress(rule.from || rule.from_email);
    const label = slugify(rule.label || rule.label_slug);
    if (!from || !label) {
        return null;
    }

    return {
        id: rule.id || crypto.createHash('sha1').update(`${from}:${label}`).digest('hex').slice(0, 16),
        from,
        label,
        enabled: rule.enabled !== false,
        created_at: rule.created_at || new Date().toISOString()
    };
};

const saveRulesToDisk = () => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            saved_at: new Date().toISOString(),
            rules: ruleCache
        }));
    } catch (error) {
        console.error('Failed to save label rules:', error.message);
    }
};

export const loadLabelRulesFromDisk = () => {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return 0;
        }

        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (!Array.isArray(parsed?.rules)) {
            return 0;
        }

        ruleCache = parsed.rules.map(normalizeRule).filter(Boolean);
        return ruleCache.length;
    } catch (error) {
        console.error('Failed to load label rules:', error.message);
        return 0;
    }
};

const saveRules = async () => {
    if (isDbConnected()) {
        await Setting.findOneAndUpdate(
            { key: SETTINGS_KEY },
            { $set: { value: { rules: ruleCache } } },
            { upsert: true, new: true }
        );
    }
    saveRulesToDisk();
};

export const getLabelRules = async () => {
    if (isDbConnected()) {
        const doc = await Setting.findOne({ key: SETTINGS_KEY });
        if (Array.isArray(doc?.value?.rules)) {
            ruleCache = doc.value.rules.map(normalizeRule).filter(Boolean);
        }
    }

    return [...ruleCache].sort((a, b) => a.from.localeCompare(b.from));
};

export const createLabelRules = async ({ from = [], label }) => {
    const labelSlug = slugify(label);
    const senders = [...new Set((Array.isArray(from) ? from : [from]).map(extractEmailAddress).filter(Boolean))];
    if (!senders.length || !labelSlug) {
        throw new Error('Sender and label are required');
    }

    await getLabelRules();
    const existingKeys = new Set(ruleCache.map((rule) => `${rule.from}:${rule.label}`));
    const created = [];

    senders.forEach((sender) => {
        const key = `${sender}:${labelSlug}`;
        if (existingKeys.has(key)) {
            return;
        }

        const rule = normalizeRule({ from: sender, label: labelSlug });
        if (rule) {
            ruleCache.push(rule);
            created.push(rule);
            existingKeys.add(key);
        }
    });

    await saveRules();
    return created;
};

export const findLabelRuleForEmail = async (from = '') => {
    const sender = extractEmailAddress(from);
    if (!sender) {
        return null;
    }

    const rules = await getLabelRules();
    return rules.find((rule) => rule.enabled && rule.from === sender) || null;
};
