import { SUPERUSER_EMAIL, isSuperUser, getSettings, updateSettingsSection } from '../services/settings-store.js';

const providerDefaults = {
    openai: {
        label: 'OpenAI',
        base_url: 'https://api.openai.com/v1',
        modelsPath: '/models',
        auth: 'bearer'
    },
    anthropic: {
        label: 'Anthropic',
        base_url: 'https://api.anthropic.com/v1',
        modelsPath: '/models',
        auth: 'anthropic'
    },
    openrouter: {
        label: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        modelsPath: '/models',
        auth: 'bearer'
    },
    kilocode: {
        label: 'Kilo Code',
        base_url: 'https://api.kilo.ai/api/gateway',
        modelsPath: '/models',
        auth: 'bearer'
    }
};

const sanitizeForUser = (settings, superUser) => ({
    general: settings.general,
    ai: superUser ? settings.ai : null,
    permissions: {
        is_superuser: superUser,
        ai_enabled: superUser && Boolean(settings.ai?.enabled)
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

const normalizeGeneralPayload = (body = {}) => ({
    email: String(body.email || SUPERUSER_EMAIL).trim() || SUPERUSER_EMAIL,
    signature_html: normalizeHtml(body.signature_html),
    autoresponder_enabled: Boolean(body.autoresponder_enabled),
    autoresponder_html: normalizeHtml(body.autoresponder_html),
    autoresponder_subject: String(body.autoresponder_subject || 'Re: {{subject}}').trim() || 'Re: {{subject}}'
});

const normalizeAiPayload = (body = {}) => ({
    enabled: Boolean(body.enabled),
    provider: providerDefaults[body.provider] ? body.provider : 'openai',
    api_key: String(body.api_key || '').trim(),
    base_url: String(body.base_url || '').trim(),
    model: String(body.model || '').trim()
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

const buildModelsUrl = (provider, baseUrl) => {
    const defaults = providerDefaults[provider] || providerDefaults.openai;
    const root = String(baseUrl || defaults.base_url).replace(/\/+$/, '');
    return `${root}${defaults.modelsPath}`;
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
    const apiKey = String(request.body?.api_key || current.ai.api_key || '').trim();
    const baseUrl = String(request.body?.base_url || current.ai.base_url || '').trim();
    const defaults = providerDefaults[provider] || providerDefaults.openai;

    if (!apiKey) {
        return response.status(400).json('API key is required before loading models');
    }

    const headers = { Accept: 'application/json' };
    if (defaults.auth === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
        const result = await fetch(buildModelsUrl(provider, baseUrl), { headers });
        const payload = await result.json().catch(() => ({}));
        if (!result.ok) {
            return response.status(result.status).json(payload?.error?.message || payload?.message || 'Could not load models');
        }

        response.status(200).json({
            provider,
            models: parseModels(payload)
        });
    } catch (error) {
        response.status(500).json(error.message || 'Could not load models');
    }
};

export const getProviderDefaults = () => providerDefaults;
