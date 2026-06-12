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

const extractSummary = (provider, payload = {}) => {
    if (provider === 'anthropic') {
        return (payload.content || [])
            .map((item) => item?.text || '')
            .join(' ')
            .trim();
    }

    return String(payload.choices?.[0]?.message?.content || '').trim();
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
    const body = provider === 'anthropic'
        ? {
            model,
            max_tokens: 220,
            system,
            messages: [{ role: 'user', content: prompt }]
        }
        : {
            model,
            max_tokens: 220,
            temperature: 0.3,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ]
        };

    const result = await fetch(buildProviderUrl(provider, config.chatPath), {
        method: 'POST',
        headers: buildProviderHeaders(provider, apiKey),
        body: JSON.stringify(body)
    });
    const payload = await result.json().catch(() => ({}));

    if (!result.ok) {
        throw new Error(payload?.error?.message || payload?.message || 'Could not summarize this email');
    }

    const summary = extractSummary(provider, payload);
    if (!summary) {
        throw new Error('The AI provider returned an empty summary');
    }

    return summary;
};
