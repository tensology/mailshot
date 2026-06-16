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

const COMPLETION_TOKEN_LIMIT = 220;

const extractSummary = (provider, payload = {}) => {
    if (provider === 'anthropic') {
        return (payload.content || [])
            .map((item) => item?.text || '')
            .join(' ')
            .trim();
    }

    return String(payload.choices?.[0]?.message?.content || '').trim();
};

const modelUsesMaxCompletionTokens = (model = '') => {
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

const getTokenLimitField = (provider, model) => {
    if (provider === 'anthropic') {
        return { max_tokens: COMPLETION_TOKEN_LIMIT };
    }

    return modelUsesMaxCompletionTokens(model)
        ? { max_completion_tokens: COMPLETION_TOKEN_LIMIT }
        : { max_tokens: COMPLETION_TOKEN_LIMIT };
};

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

const modelSupportsTemperature = (model = '') => !modelUsesMaxCompletionTokens(model);

const isTemperatureParameterError = (message = '') => String(message).toLowerCase().includes('temperature');

const stripTemperature = (body = {}) => {
    const { temperature, ...rest } = body;
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

    return next;
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

export const summarizeWithProvider = async ({ settings, prompt }) => {
    const ai = settings.ai || {};
    const provider = providerDefaults[ai.provider] ? ai.provider : 'openai';
    const config = getProviderConfig(provider);
    const apiKey = String(ai.api_key || '').trim();
    const model = String(ai.model || '').trim();

    if (!apiKey || !model || !ai.enabled) {
        throw new Error('AI provider, API key, and model must be saved before read aloud is available.');
    }

    const system = 'You summarize email for spoken playback. Be concise, natural, and useful. Do not mention raw headers unless they matter.';
    let body = provider === 'anthropic'
        ? {
            model,
            ...getTokenLimitField(provider, model),
            system,
            messages: [{ role: 'user', content: prompt }]
        }
        : {
            model,
            ...getTokenLimitField(provider, model),
            ...(modelSupportsTemperature(model) ? { temperature: 0.3 } : {}),
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ]
        };

    let result;
    let payload = {};

    for (let attempt = 0; attempt < 3; attempt += 1) {
        ({ result, payload } = await requestSummary({ provider, config, apiKey, body }));

        if (result.ok) {
            break;
        }

        const message = payload?.error?.message || payload?.message || '';
        const adjustedBody = adjustBodyForProviderError(body, message);
        if (JSON.stringify(adjustedBody) === JSON.stringify(body)) {
            break;
        }

        body = adjustedBody;
    }

    if (!result.ok) {
        throw new Error(payload?.error?.message || payload?.message || 'Could not summarize this email');
    }

    const summary = extractSummary(provider, payload);
    if (!summary) {
        throw new Error('The AI provider returned an empty summary');
    }

    return summary;
};
