import { SUPERUSER_EMAIL, isSuperUser, getSettings, updateSettingsSection } from '../services/settings-store.js';
import {
    buildProviderHeaders,
    buildProviderUrl,
    getProviderConfig,
    hasSummaryProviderConfigured,
    parseNvidiaModels,
    providerDefaults
} from '../services/ai-provider.js';

const sanitizeForUser = (settings, superUser) => ({
    general: settings.general,
    ai: superUser ? settings.ai : null,
    tts: superUser ? settings.tts : null,
    permissions: {
        is_superuser: superUser,
        ai_enabled: superUser && Boolean(settings.ai?.enabled),
        read_aloud_enabled: superUser && hasSummaryProviderConfigured(settings)
    },
    providers: providerDefaults
});

const requireSuperUser = (request, response) => {
    if (!isSuperUser(request.auth?.username)) {
        response.status(403).json('Only the super user can manage global settings');
        return false;
    }
    return true;
};

const normalizeHtml = (value = '') => String(value || '').trim();
const normalizeEmail = (value = '') => {
    const raw = String(value || '').trim().toLowerCase();
    const email = (/<([^>]+)>/.exec(raw)?.[1] || raw).trim();
    return email;
};

const normalizeSignatures = (body = {}) => {
    const source = Array.isArray(body.signatures) ? body.signatures : [];
    const byEmail = new Map();

    source.forEach((entry = {}) => {
        const email = normalizeEmail(entry.email);
        if (!email) return;
        byEmail.set(email, {
            email,
            signature_html: normalizeHtml(entry.signature_html)
        });
    });

    if (!byEmail.size) {
        const email = normalizeEmail(body.email) || SUPERUSER_EMAIL;
        byEmail.set(email, {
            email,
            signature_html: normalizeHtml(body.signature_html)
        });
    }

    if (!byEmail.has(SUPERUSER_EMAIL)) {
        byEmail.set(SUPERUSER_EMAIL, { email: SUPERUSER_EMAIL, signature_html: '' });
    }

    return [...byEmail.values()];
};

const normalizeAutoresponders = (body = {}) => {
    const source = Array.isArray(body.autoresponders) ? body.autoresponders : [];
    const byEmail = new Map();

    source.forEach((entry = {}) => {
        const email = normalizeEmail(entry.email);
        if (!email) return;
        byEmail.set(email, {
            email,
            enabled: Boolean(entry.enabled),
            html: normalizeHtml(entry.html || entry.autoresponder_html),
            subject: String(entry.subject || entry.autoresponder_subject || 'Re: {{subject}}').trim() || 'Re: {{subject}}'
        });
    });

    if (!byEmail.size) {
        const email = normalizeEmail(body.email) || SUPERUSER_EMAIL;
        byEmail.set(email, {
            email,
            enabled: Boolean(body.autoresponder_enabled),
            html: normalizeHtml(body.autoresponder_html),
            subject: String(body.autoresponder_subject || 'Re: {{subject}}').trim() || 'Re: {{subject}}'
        });
    }

    if (!byEmail.has(SUPERUSER_EMAIL)) {
        byEmail.set(SUPERUSER_EMAIL, {
            email: SUPERUSER_EMAIL,
            enabled: false,
            html: '',
            subject: 'Re: {{subject}}'
        });
    }

    return [...byEmail.values()];
};

const normalizeGeneralPayload = (body = {}) => {
    const signatures = normalizeSignatures(body);
    const autoresponders = normalizeAutoresponders(body);
    const selectedEmail = normalizeEmail(body.selected_email || body.email) || signatures[0]?.email || SUPERUSER_EMAIL;
    const selectedSignature = signatures.find((entry) => entry.email === selectedEmail) || signatures[0];
    const selectedAutoresponder = autoresponders.find((entry) => entry.email === selectedEmail) || autoresponders[0];

    return {
        email: selectedEmail,
        selected_email: selectedEmail,
        signatures,
        autoresponders,
        signature_html: selectedSignature?.signature_html || '',
        autoresponder_enabled: Boolean(selectedAutoresponder?.enabled),
        autoresponder_html: selectedAutoresponder?.html || '',
        autoresponder_subject: selectedAutoresponder?.subject || 'Re: {{subject}}'
    };
};

const normalizeAiPayload = (body = {}) => {
    const provider = providerDefaults[body.provider] ? body.provider : 'openai';
    const api_key = String(body.api_key || '').trim();
    const model = String(body.model || '').trim();
    const api_keys = {
        ...(body.api_keys || {}),
        [provider]: api_key
    };

    return {
        enabled: Boolean(body.enabled ?? api_key),
        provider,
        api_key,
        api_keys,
        model,
        summary_provider: provider,
        summary_api_key: '',
        summary_model: ''
    };
};

const normalizeTtsPayload = (body = {}) => ({
    voice: String(body.voice || 'af_heart').trim() || 'af_heart'
});

export const getAppSettings = async (request, response) => {
    const settings = await getSettings();
    response.status(200).json(sanitizeForUser(settings, isSuperUser(request.auth?.username)));
};

export const updateGeneralSettings = async (request, response) => {
    if (!requireSuperUser(request, response)) {
        return;
    }
    const settings = await updateSettingsSection('general', normalizeGeneralPayload(request.body));
    response.status(200).json(sanitizeForUser(settings, true));
};

export const updateAiSettings = async (request, response) => {
    if (!requireSuperUser(request, response)) {
        return;
    }
    const settings = await updateSettingsSection('ai', normalizeAiPayload(request.body));
    response.status(200).json(sanitizeForUser(settings, true));
};

export const updateTtsSettings = async (request, response) => {
    if (!requireSuperUser(request, response)) {
        return;
    }
    const settings = await updateSettingsSection('tts', normalizeTtsPayload(request.body));
    response.status(200).json(sanitizeForUser(settings, true));
};

const buildModelsUrl = (provider) => {
    const defaults = getProviderConfig(provider);
    return buildProviderUrl(provider, defaults.modelsPath);
};

const parseModels = (payload) => {
    if (Array.isArray(payload?.data)) {
        return payload.data.map((item) => ({
            id: item.id,
            name: item.name || item.id
        })).filter((item) => item.id);
    }

    if (Array.isArray(payload?.models)) {
        return payload.models.map((item) => ({
            id: item.id || item.name,
            name: item.name || item.id
        })).filter((item) => item.id);
    }

    if (payload?.models && typeof payload.models === 'object') {
        return Object.entries(payload.models).map(([id, value]) => ({
            id,
            name: value?.name || value?.display_name || id
        }));
    }

    return [];
};

export const fetchAiModels = async (request, response) => {
    if (!requireSuperUser(request, response)) {
        return;
    }

    const current = await getSettings();
    const provider = providerDefaults[request.body?.provider] ? request.body.provider : current.ai.provider;
    const apiKey = String(
        request.body?.api_key
        || request.body?.api_keys?.[provider]
        || current.ai.api_keys?.[provider]
        || current.ai.api_key
        || ''
    ).trim();

    if (!apiKey) {
        return response.status(400).json('API key is required before loading models');
    }

    try {
        const result = await fetch(buildModelsUrl(provider), { headers: buildProviderHeaders(provider, apiKey) });
        const payload = await result.json().catch(() => ({}));
        if (!result.ok) {
            return response.status(result.status).json(payload?.error?.message || payload?.message || 'Could not load models');
        }

        response.status(200).json({
            provider,
            models: provider === 'nvidia' ? parseNvidiaModels(payload) : parseModels(payload)
        });
    } catch (error) {
        response.status(500).json(error.message || 'Could not load models');
    }
};

export const getProviderDefaults = () => providerDefaults;
