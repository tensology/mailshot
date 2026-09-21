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

export const extractEmailDomain = (value = '') => {
    const address = extractEmailAddress(value);
    const at = address.lastIndexOf('@');
    return at >= 0 ? address.slice(at + 1) : '';
};

const normalizeRule = (rule = {}) => {
    const from = extractEmailAddress(rule.from || rule.from_email);
    const fromDomain = String(rule.from_domain || '').trim().toLowerCase().replace(/^@/, '');
    const subjectContains = String(rule.subject_contains || rule.subject || '').trim().toLowerCase();
    const label = slugify(rule.label || rule.label_slug);
    if (!label || (!from && !fromDomain && !subjectContains)) {
        return null;
    }

    const identity = [from, fromDomain, subjectContains, label].join(':');
    return {
        id: rule.id || crypto.createHash('sha1').update(identity).digest('hex').slice(0, 16),
        from,
        from_domain: fromDomain,
        subject_contains: subjectContains,
        label,
        enabled: rule.enabled !== false,
        created_at: rule.created_at || new Date().toISOString()
    };
};

const ruleMatchesMessage = (rule, { from = '', subject = '' } = {}) => {
    if (!rule?.enabled) {
        return false;
    }

    const sender = extractEmailAddress(from);
    const domain = extractEmailDomain(from);
    const subjectText = String(subject || '').toLowerCase();

    if (rule.from && rule.from !== sender) {
        return false;
    }
    if (rule.from_domain && rule.from_domain !== domain) {
        return false;
    }
    if (rule.subject_contains && !subjectText.includes(rule.subject_contains)) {
        return false;
    }

    return Boolean(rule.from || rule.from_domain || rule.subject_contains);
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

    return [...ruleCache].sort((a, b) => {
        const left = a.from || a.from_domain || a.subject_contains || '';
        const right = b.from || b.from_domain || b.subject_contains || '';
        return left.localeCompare(right);
    });
};

export const createLabelRules = async ({
    from = [],
    from_domain = '',
    subject_contains = '',
    label
} = {}) => {
    const labelSlug = slugify(label);
    const senders = [...new Set((Array.isArray(from) ? from : [from]).map(extractEmailAddress).filter(Boolean))];
    const domain = String(from_domain || '').trim().toLowerCase().replace(/^@/, '');
    const subject = String(subject_contains || '').trim().toLowerCase();

    if (!labelSlug || (!senders.length && !domain && !subject)) {
        throw new Error('Label and at least one match condition are required');
    }

    await getLabelRules();
    const existingKeys = new Set(ruleCache.map((rule) => (
        `${rule.from}|${rule.from_domain}|${rule.subject_contains}|${rule.label}`
    )));
    const created = [];

    const pushRule = (partial) => {
        const rule = normalizeRule({ ...partial, label: labelSlug });
        if (!rule) {
            return;
        }
        const key = `${rule.from}|${rule.from_domain}|${rule.subject_contains}|${rule.label}`;
        if (existingKeys.has(key)) {
            return;
        }
        ruleCache.push(rule);
        created.push(rule);
        existingKeys.add(key);
    };

    if (senders.length) {
        senders.forEach((sender) => pushRule({
            from: sender,
            from_domain: domain,
            subject_contains: subject
        }));
    } else {
        pushRule({ from_domain: domain, subject_contains: subject });
    }

    await saveRules();
    return created;
};

export const findLabelRuleForEmail = async (from = '', subject = '') => (
    findLabelRuleForMessage({ from, subject })
);

export const findLabelRuleForMessage = async ({ from = '', subject = '' } = {}) => {
    const rules = await getLabelRules();
    return rules.find((rule) => ruleMatchesMessage(rule, { from, subject })) || null;
};
