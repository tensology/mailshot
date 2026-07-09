export const providerDefaults = {
    openai: {
        label: 'OpenAI',
        base_url: 'https://api.openai.com/v1',
        modelsPath: '/models',
        auth: 'bearer',
        chatPath: '/chat/completions'
    },
    anthropic: {
        label: 'Anthropic',
        base_url: 'https://api.anthropic.com/v1',
        modelsPath: '/models',
        auth: 'anthropic',
        chatPath: '/messages'
    },
    openrouter: {
        label: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        modelsPath: '/models',
        auth: 'bearer',
        chatPath: '/chat/completions'
    },
    kilocode: {
        label: 'Kilo Code',
        base_url: 'https://api.kilo.ai/api/gateway',
        modelsPath: '/models',
        auth: 'bearer',
        chatPath: '/chat/completions'
    },
    nvidia: {
        label: 'NVIDIA',
        base_url: 'https://integrate.api.nvidia.com/v1',
        modelsPath: '/models',
        auth: 'bearer',
        chatPath: '/chat/completions'
    }
};

export const getProviderConfig = (provider) => providerDefaults[provider] || providerDefaults.openai;

export const buildProviderUrl = (provider, path) => {
    const config = getProviderConfig(provider);
    return `${String(config.base_url).replace(/\/+$/, '')}${path}`;
};

export const buildProviderHeaders = (provider, apiKey) => {
    const config = getProviderConfig(provider);
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };

    if (config.auth === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
};

const STANDARD_COMPLETION_TOKEN_LIMIT = 220;
const REASONING_COMPLETION_TOKEN_LIMIT = 1000;

export const FAST_SUMMARY_MODEL_DEFAULTS = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    openrouter: 'openai/gpt-4o-mini',
    kilocode: 'gpt-4o-mini',
    nvidia: 'meta/llama-3.3-70b-instruct'
};

const NVIDIA_MODEL_SKIP_PATTERNS = [
    'embed',
    'embedding',
    'rerank',
    'whisper',
    'tts',
    'moderation',
    'guard',
    'sdxl',
    'flux',
    'stable-diffusion'
];

export const parseNvidiaModels = (payload = {}) => {
    const chatModels = (payload?.data || [])
        .map((item) => item?.id || '')
        .filter((modelId) => {
            if (!modelId) {
                return false;
            }

            const normalized = modelId.toLowerCase();
            return !NVIDIA_MODEL_SKIP_PATTERNS.some((pattern) => normalized.includes(pattern));
        });

    const sortKey = (modelId) => {
        const normalized = modelId.toLowerCase();
        if (normalized.includes('nemotron')) return 0;
        if (normalized.includes('llama-3.3') || normalized.includes('llama3.3')) return 1;
        if (normalized.includes('deepseek')) return 2;
        if (normalized.includes('kimi')) return 3;
        if (normalized.includes('glm')) return 4;
        if (normalized.includes('llama')) return 5;
        return 6;
    };

    return [...chatModels]
        .sort((left, right) => {
            const leftKey = sortKey(left);
            const rightKey = sortKey(right);
            if (leftKey !== rightKey) {
                return leftKey - rightKey;
            }

            return left.localeCompare(right);
        })
        .map((modelId) => {
            const tail = modelId.includes('/') ? modelId.split('/').pop() : modelId;
            const name = tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
            return {
                id: modelId,
                name: `${name} (free)`
            };
        });
};

export const resolveSummaryCredentials = (settings = {}) => {
    const ai = settings.ai || {};
    const envProvider = String(process.env.MAILSHOT_SUMMARY_PROVIDER || '').trim();

    const legacySummaryKey = String(ai.summary_api_key || '').trim();
    if (legacySummaryKey && providerDefaults[ai.summary_provider]) {
        return {
            provider: ai.summary_provider,
            apiKey: legacySummaryKey
        };
    }

    const provider = providerDefaults[ai.provider]
        ? ai.provider
        : (providerDefaults[envProvider] ? envProvider : 'openai');

    return {
        provider,
        apiKey: String(ai.api_keys?.[provider] || ai.api_key || '').trim()
    };
};

export const hasSummaryProviderConfigured = (settings = {}) => {
    const ai = settings.ai || {};
    const { apiKey } = resolveSummaryCredentials(settings);
    return Boolean(ai.enabled && apiKey);
};

const CHEAP_SUMMARY_MODEL_PATTERNS = [
    /mini/i,
    /haiku/i,
    /flash/i,
    /nano/i
];

export const isCheapSummaryModel = (model = '') => {
    const normalized = String(model || '').trim();
    if (!normalized || modelUsesMaxCompletionTokens(normalized)) {
        return false;
    }

    return CHEAP_SUMMARY_MODEL_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const resolveSummaryModel = (settings = {}) => {
    const ai = settings.ai || {};
    const { provider } = resolveSummaryCredentials(settings);
    const envOverride = String(process.env.MAILSHOT_SUMMARY_MODEL || '').trim();
    if (envOverride) {
        return envOverride;
    }

    const mainModel = String(ai.model || '').trim();
    if (mainModel && ai.provider === provider) {
        return mainModel;
    }

    return FAST_SUMMARY_MODEL_DEFAULTS[provider] || FAST_SUMMARY_MODEL_DEFAULTS.openai;
};

export const modelUsesMaxCompletionTokens = (model = '') => {
    const normalized = String(model || '').toLowerCase();
    return (
        /^o\d/.test(normalized)
        || /^gpt-4\.1/.test(normalized)
        || /^gpt-4\.5/.test(normalized)
        || /^gpt-5/.test(normalized)
        || normalized.includes('/o1')
        || normalized.includes('/o3')
        || normalized.includes('/o4')
    );
};

export const modelSupportsTemperature = (model = '') => !modelUsesMaxCompletionTokens(model);

export const getCompletionRequestOptions = (provider, model, { expanded = false } = {}) => {
    if (provider === 'anthropic') {
        return { max_tokens: STANDARD_COMPLETION_TOKEN_LIMIT };
    }

    if (modelUsesMaxCompletionTokens(model)) {
        return {
            max_completion_tokens: expanded ? REASONING_COMPLETION_TOKEN_LIMIT * 2 : REASONING_COMPLETION_TOKEN_LIMIT,
            reasoning_effort: 'low'
        };
    }

    return { max_tokens: STANDARD_COMPLETION_TOKEN_LIMIT };
};

export const extractSummary = (provider, payload = {}) => {
    if (provider === 'anthropic') {
        return (payload.content || [])
            .map((item) => item?.text || '')
            .join(' ')
            .trim();
    }

    const message = payload.choices?.[0]?.message || {};
    const content = message.content;

    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content
            .map((item) => (typeof item === 'string' ? item : item?.text || ''))
            .join(' ')
            .trim();
    }

    return '';
};

export const wasSummaryTruncated = (payload = {}) => payload?.choices?.[0]?.finish_reason === 'length';

const isTokenLimitParameterError = (message = '') => {
    const normalized = String(message).toLowerCase();
    return normalized.includes('max_tokens') && normalized.includes('max_completion_tokens');
};

const swapTokenLimitField = (body = {}) => {
    if (Object.prototype.hasOwnProperty.call(body, 'max_completion_tokens')) {
        const { max_completion_tokens, ...rest } = body;
        return { ...rest, max_tokens: max_completion_tokens };
    }

    const { max_tokens, ...rest } = body;
    return { ...rest, max_completion_tokens: max_tokens };
};

const isTemperatureParameterError = (message = '') => String(message).toLowerCase().includes('temperature');

const isReasoningEffortParameterError = (message = '') => String(message).toLowerCase().includes('reasoning_effort');

const stripTemperature = (body = {}) => {
    const { temperature, ...rest } = body;
    return rest;
};

const stripReasoningEffort = (body = {}) => {
    const { reasoning_effort, ...rest } = body;
    return rest;
};

const adjustBodyForProviderError = (body = {}, message = '') => {
    let next = body;

    if (isTokenLimitParameterError(message)) {
        next = swapTokenLimitField(next);
    }

    if (isTemperatureParameterError(message)) {
        next = stripTemperature(next);
    }

    if (isReasoningEffortParameterError(message)) {
        next = stripReasoningEffort(next);
    }

    return next;
};

const buildSummaryBody = ({ provider, model, prompt, expanded = false }) => {
    const system = 'You summarize email for spoken playback. Be concise, natural, and useful. Do not mention raw headers unless they matter.';

    if (provider === 'anthropic') {
        return {
            model,
            ...getCompletionRequestOptions(provider, model, { expanded }),
            system,
            messages: [{ role: 'user', content: prompt }]
        };
    }

    return {
        model,
        ...getCompletionRequestOptions(provider, model, { expanded }),
        ...(modelSupportsTemperature(model) ? { temperature: 0.3 } : {}),
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
        ]
    };
};

const requestSummary = async ({ provider, config, apiKey, body }) => {
    const result = await fetch(buildProviderUrl(provider, config.chatPath), {
        method: 'POST',
        headers: buildProviderHeaders(provider, apiKey),
        body: JSON.stringify(body)
    });
    const payload = await result.json().catch(() => ({}));
    return { result, payload };
};

const getProviderPayloadMessage = (payload = {}) => (
    payload?.error?.message || payload?.message || ''
);

const requestSummaryWithRetries = async ({ provider, config, apiKey, model, prompt, trace = {} }) => {
    let body = buildSummaryBody({ provider, model, prompt });
    let result;
    let payload = {};
    const startedAt = Date.now();

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const attemptStartedAt = Date.now();
        logPipelineEvent('summary.provider.request', {
            ...trace,
            provider,
            model,
            attempt: attempt + 1,
            prompt_length: String(prompt || '').length,
            uses_max_completion_tokens: Object.prototype.hasOwnProperty.call(body, 'max_completion_tokens'),
            has_temperature: Object.prototype.hasOwnProperty.call(body, 'temperature'),
            has_reasoning_effort: Object.prototype.hasOwnProperty.call(body, 'reasoning_effort')
        });
        ({ result, payload } = await requestSummary({ provider, config, apiKey, body }));
        logPipelineEvent(result.ok ? 'summary.provider.response' : 'summary.provider.error_response', {
            ...trace,
            provider,
            model,
            attempt: attempt + 1,
            status: result.status,
            status_text: result.statusText,
            duration_ms: Date.now() - attemptStartedAt,
            finish_reason: payload?.choices?.[0]?.finish_reason || '',
            provider_message: getProviderPayloadMessage(payload)
        }, result.ok ? 'info' : 'warn');

        if (result.ok) {
            break;
        }

        const message = getProviderPayloadMessage(payload);
        const adjustedBody = adjustBodyForProviderError(body, message);
        if (JSON.stringify(adjustedBody) === JSON.stringify(body)) {
            break;
        }

        logPipelineEvent('summary.provider.retry_adjusted', {
            ...trace,
            provider,
            model,
            attempt: attempt + 1,
            message,
            changed_fields: {
                max_tokens: body.max_tokens !== adjustedBody.max_tokens,
                max_completion_tokens: body.max_completion_tokens !== adjustedBody.max_completion_tokens,
                temperature_removed: Object.prototype.hasOwnProperty.call(body, 'temperature') && !Object.prototype.hasOwnProperty.call(adjustedBody, 'temperature'),
                reasoning_effort_removed: Object.prototype.hasOwnProperty.call(body, 'reasoning_effort') && !Object.prototype.hasOwnProperty.call(adjustedBody, 'reasoning_effort')
            }
        }, 'warn');
        body = adjustedBody;
    }

    if (!result.ok) {
        const error = new Error(getProviderPayloadMessage(payload) || 'Could not summarize this email');
        error.status = result.status;
        throw error;
    }

    let summary = extractSummary(provider, payload);
    if (!summary && wasSummaryTruncated(payload) && modelUsesMaxCompletionTokens(model)) {
        logPipelineEvent('summary.provider.retry_expanded', {
            ...trace,
            provider,
            model,
            reason: 'empty_summary_after_length_finish'
        }, 'warn');
        body = buildSummaryBody({ provider, model, prompt, expanded: true });
        ({ result, payload } = await requestSummary({ provider, config, apiKey, body }));

        if (!result.ok) {
            const error = new Error(getProviderPayloadMessage(payload) || 'Could not summarize this email');
            error.status = result.status;
            throw error;
        }

        summary = extractSummary(provider, payload);
    }

    logPipelineEvent('summary.provider.complete', {
        ...trace,
        provider,
        model,
        duration_ms: Date.now() - startedAt,
        summary_length: String(summary || '').length,
        finish_reason: payload?.choices?.[0]?.finish_reason || ''
    });
    return summary;
};

export const summarizeWithProvider = async ({ settings, prompt, model: modelOverride = '', trace = {} }) => {
    const ai = settings.ai || {};
    const provider = providerDefaults[ai.provider] ? ai.provider : 'openai';
    const config = getProviderConfig(provider);
    const apiKey = String(ai.api_keys?.[provider] || ai.api_key || '').trim();
    const model = String(modelOverride || ai.model || '').trim();

    if (!apiKey || !model || !ai.enabled) {
        const error = new Error('AI provider, API key, and model must be saved before read aloud is available.');
        logPipelineEvent('summary.provider.not_configured', {
            ...trace,
            provider,
            model_configured: Boolean(model),
            api_key_configured: Boolean(apiKey),
            ai_enabled: Boolean(ai.enabled)
        }, 'warn');
        throw error;
    }

    let summary = '';
    try {
        summary = await requestSummaryWithRetries({ provider, config, apiKey, model, prompt, trace });
    } catch (error) {
        logPipelineEvent('summary.provider.failed', {
            ...trace,
            provider,
            model,
            error: getErrorLogContext(error)
        }, 'error');
        throw error;
    }
    if (!summary) {
        logPipelineEvent('summary.provider.empty', {
            ...trace,
            provider,
            model
        }, 'error');
        throw new Error('The AI provider returned an empty summary');
    }

    return summary;
};

export const summarizeEmailWithSettings = async ({ settings, prompt, trace = {} }) => {
    const { provider, apiKey } = resolveSummaryCredentials(settings);
    if (!apiKey) {
        throw new Error('Save a summary provider API key before using read aloud.');
    }

    const summaryModel = resolveSummaryModel(settings);
    logPipelineEvent('summary.provider.selected', {
        ...trace,
        provider,
        model: summaryModel,
        prompt_length: String(prompt || '').length
    });
    return summarizeWithProvider({
        settings: {
            ...settings,
            ai: {
                ...settings.ai,
                enabled: true,
                provider,
                api_key: apiKey
            }
        },
        prompt,
        model: summaryModel,
        trace
    });
};
import {
    getErrorLogContext,
    logPipelineEvent
} from './pipeline-logger.js';
