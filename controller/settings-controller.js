import { randomUUID } from 'crypto';
import { superuserEmail, isSuperUser, getSettings, updateSettingsSection } from '../services/settings-store.js';
import {
    buildProviderHeaders,
    buildProviderUrl,
    getProviderConfig,
    hasSummaryProviderConfigured,
    parseNvidiaModels,
    providerDefaults
} from '../services/ai-provider.js';
import { canEncryptSecrets } from '../services/secret-store.js';
import { assertSafeExternalUrl } from '../services/safe-url.js';
import { listFishAudioVoices } from '../services/fishaudio-voices.js';

const sanitizeForUser = (settings, superUser) => ({
    general: settings.general,
    ai: superUser ? {
        enabled: Boolean(settings.ai?.enabled),
        provider: settings.ai?.provider || 'nvidia',
        model: settings.ai?.model || '',
        summary_provider: settings.ai?.summary_provider || 'nvidia',
        summary_model: settings.ai?.summary_model || '',
        api_key_set: Boolean(settings.ai?.api_key),
        summary_api_key_set: Boolean(settings.ai?.summary_api_key),
        api_keys_set: Object.fromEntries(
            Object.entries(settings.ai?.api_keys || {}).map(([key, value]) => [key, Boolean(value)])
        )
    } : null,
    tts: superUser ? {
        provider: settings.tts?.provider || 'kokoro',
        voice: settings.tts?.voice || 'af_heart',
        fishaudio_voice: settings.tts?.fishaudio_voice || '',
        fishaudio_model: settings.tts?.fishaudio_model || 's2.1-pro-free',
        fishaudio_key_set: Boolean(settings.tts?.fishaudio_key)
    } : null,
    tensology: superUser ? {
        enabled: Boolean(settings.tensology?.enabled),
        base_url: settings.tensology?.base_url || 'https://www.tensology.com',
        api_key_set: Boolean(settings.tensology?.api_key)
    } : null,
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
        const email = normalizeEmail(body.email) || superuserEmail();
        byEmail.set(email, {
            email,
            signature_html: normalizeHtml(body.signature_html)
        });
    }

    if (!byEmail.has(superuserEmail())) {
        byEmail.set(superuserEmail(), { email: superuserEmail(), signature_html: '' });
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
        const email = normalizeEmail(body.email) || superuserEmail();
        byEmail.set(email, {
            email,
            enabled: Boolean(body.autoresponder_enabled),
            html: normalizeHtml(body.autoresponder_html),
            subject: String(body.autoresponder_subject || 'Re: {{subject}}').trim() || 'Re: {{subject}}'
        });
    }

    if (!byEmail.has(superuserEmail())) {
        byEmail.set(superuserEmail(), {
            email: superuserEmail(),
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
    const selectedEmail = normalizeEmail(body.selected_email || body.email) || signatures[0]?.email || superuserEmail();
    const selectedSignature = signatures.find((entry) => entry.email === selectedEmail) || signatures[0];
    const selectedAutoresponder = autoresponders.find((entry) => entry.email === selectedEmail) || autoresponders[0];
    const templates = Array.isArray(body.templates)
        ? body.templates.map((entry = {}) => ({
            id: String(entry.id || randomUUID()),
            name: String(entry.name || 'Template').trim() || 'Template',
            subject: String(entry.subject || ''),
            body_html: String(entry.body_html || entry.html || '')
        })).filter((entry) => entry.name)
        : undefined;

    return {
        email: selectedEmail,
        selected_email: selectedEmail,
        signatures,
        autoresponders,
        ...(templates ? { templates } : {}),
        signature_html: selectedSignature?.signature_html || '',
        autoresponder_enabled: Boolean(selectedAutoresponder?.enabled),
        autoresponder_html: selectedAutoresponder?.html || '',
        autoresponder_subject: selectedAutoresponder?.subject || 'Re: {{subject}}'
    };
};

const normalizeAiPayload = (body = {}, current = {}) => {
    const provider = providerDefaults[body.provider] ? body.provider : (current.provider || 'openai');
    const api_key = String(body.api_key || '').trim() || String(current.api_key || '');
    const summary_api_key = String(body.summary_api_key || '').trim() || String(current.summary_api_key || '');
    const api_keys = {
        ...(current.api_keys || {}),
        ...(body.api_keys || {}),
        [provider]: api_key
    };

    return {
        enabled: Boolean(body.enabled ?? current.enabled ?? api_key),
        provider,
        api_key,
        api_keys,
        model: String(body.model || current.model || '').trim(),
        summary_provider: providerDefaults[body.summary_provider]
            ? body.summary_provider
            : (current.summary_provider || provider),
        summary_api_key,
        summary_model: String(body.summary_model || current.summary_model || '').trim()
    };
};

const normalizeTtsPayload = (body = {}) => {
    const payload = {};
    if (body.provider !== undefined) {
        const provider = String(body.provider || '').trim().toLowerCase();
        payload.provider = ['kokoro', 'fishaudio'].includes(provider) ? provider : 'kokoro';
    }
    if (body.voice !== undefined) {
        payload.voice = String(body.voice || 'af_heart').trim() || 'af_heart';
    }
    if (body.fishaudio_key !== undefined) {
        payload.fishaudio_key = String(body.fishaudio_key || '').trim();
    }
    if (body.fishaudio_voice !== undefined) {
        payload.fishaudio_voice = String(body.fishaudio_voice || '').trim();
    }
    if (body.fishaudio_model !== undefined) {
        payload.fishaudio_model = String(body.fishaudio_model || 's2.1-pro-free').trim() || 's2.1-pro-free';
    }
    return payload;
};

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
    const current = await getSettings();
    const settings = await updateSettingsSection('ai', normalizeAiPayload(request.body, current.ai || {}));
    response.status(200).json(sanitizeForUser(settings, true));
};

export const updateTtsSettings = async (request, response) => {
    if (!requireSuperUser(request, response)) {
        return;
    }
    const settings = await updateSettingsSection('tts', normalizeTtsPayload(request.body));
    response.status(200).json(sanitizeForUser(settings, true));
};

// Any signed-in user may pick the voice for the mailbox they are using.
export const getTtsVoices = async (request, response) => {
    try {
        const settings = await getSettings();
        const { voices, activeVoiceId, defaultVoiceId } = await listFishAudioVoices(settings);
        return response.status(200).json({ voices, active_voice_id: activeVoiceId, default_voice_id: defaultVoiceId || '' });
    } catch (error) {
        return response.status(502).json(error.message || 'Could not load voices');
    }
};

export const updateTtsVoice = async (request, response) => {
    const voiceId = String(request.body?.voice_id || '').trim();
    const settings = await updateSettingsSection('tts', { fishaudio_voice: voiceId });
    return response.status(200).json({ active_voice_id: settings.tts?.fishaudio_voice || '' });
};

const normalizeTensologyPayload = (body = {}, current = {}) => ({
    enabled: Boolean(body.enabled),
    base_url: String(body.base_url || current.base_url || 'https://www.tensology.com').trim().replace(/\/$/, ''),
    api_key: String(body.api_key || current.api_key || '').trim()
});

const fetchTensologyIdentity = async ({ base_url, api_key }) => {
    const safeBase = await assertSafeExternalUrl(base_url);
    const result = await fetch(`${safeBase}/api/integrations/v1/identity`, {
        headers: { Authorization: `Bearer ${api_key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
    });
    const body = await result.json().catch(() => ({}));
    if (!result.ok) {
        throw new Error(body?.error?.message || 'Tensology rejected the API key');
    }
    if (body?.data?.audience !== 'mailshot') {
        throw new Error('Use a Mailshot audience key generated by Tensology admin');
    }
    return body.data;
};

export const updateTensologySettings = async (request, response) => {
    if (!requireSuperUser(request, response)) return;
    const current = await getSettings();
    const next = normalizeTensologyPayload(request.body, current.tensology);
    if (next.enabled && !next.api_key) {
        return response.status(400).json('A Tensology API key is required');
    }
    if (next.api_key && !canEncryptSecrets() && !process.env.TENSOLOGY_API_KEY) {
        return response.status(503).json('MAILSHOT_SETTINGS_SECRET must be configured before saving this key');
    }
    try {
        next.base_url = await assertSafeExternalUrl(next.base_url);
        const identity = next.enabled ? await fetchTensologyIdentity(next) : null;
        const settings = await updateSettingsSection('tensology', next);
        return response.status(200).json({ ...sanitizeForUser(settings, true), tensology_identity: identity });
    } catch (error) {
        return response.status(400).json(error.message || 'Could not connect to Tensology');
    }
};

export const testTensologyConnection = async (request, response) => {
    if (!requireSuperUser(request, response)) return;
    const settings = await getSettings();
    try {
        const identity = await fetchTensologyIdentity(settings.tensology || {});
        return response.status(200).json({ connected: true, identity });
    } catch (error) {
        return response.status(400).json({ connected: false, message: error.message });
    }
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
