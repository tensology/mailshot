import test from 'node:test';
import assert from 'node:assert/strict';

import {
    summarizeWithProvider,
    extractSummary,
    getCompletionRequestOptions,
    hasSummaryProviderConfigured,
    modelSupportsTemperature,
    modelUsesMaxCompletionTokens,
    resolveSummaryCredentials,
    resolveSummaryModel,
    wasSummaryTruncated
} from './ai-provider.js';

test('detects reasoning models that need max_completion_tokens', () => {
    assert.equal(modelUsesMaxCompletionTokens('o4-mini'), true);
    assert.equal(modelUsesMaxCompletionTokens('openai/o3-mini'), true);
    assert.equal(modelUsesMaxCompletionTokens('gpt-5'), true);
    assert.equal(modelUsesMaxCompletionTokens('gpt-4o-mini'), false);
});

test('reasoning models skip temperature and request low reasoning effort', () => {
    assert.equal(modelSupportsTemperature('o4-mini'), false);
    assert.deepEqual(getCompletionRequestOptions('openai', 'o4-mini'), {
        max_completion_tokens: 4096,
        reasoning_effort: 'low'
    });
});

test('standard models allow a substantive explanation', () => {
    assert.deepEqual(getCompletionRequestOptions('openai', 'gpt-4o-mini'), {
        max_tokens: 1800
    });
});

test('expanded retry gives standard models enough room after length truncation', () => {
    assert.deepEqual(getCompletionRequestOptions('openrouter', 'tencent/hy3:free', { expanded: true }), {
        max_tokens: 6000
    });
});

test('extractSummary handles string and array chat completion content', () => {
    assert.equal(
        extractSummary('openai', {
            choices: [{ message: { content: '  Hello there. ' } }]
        }),
        'Hello there.'
    );

    assert.equal(
        extractSummary('openai', {
            choices: [{ message: { content: [{ text: 'Part one.' }, { text: 'Part two.' }] } }]
        }),
        'Part one. Part two.'
    );
});

test('wasSummaryTruncated detects token-limit finish reasons', () => {
    assert.equal(wasSummaryTruncated({ choices: [{ finish_reason: 'length' }] }), true);
    assert.equal(wasSummaryTruncated({ choices: [{ finish_reason: 'stop' }] }), false);
});

test('resolveSummaryCredentials uses the main provider settings', () => {
    assert.deepEqual(resolveSummaryCredentials({
        ai: {
            provider: 'nvidia',
            api_key: 'test-provider-key'
        }
    }), {
        provider: 'nvidia',
        apiKey: 'test-provider-key'
    });

    assert.deepEqual(resolveSummaryCredentials({
        ai: {
            provider: 'openai',
            api_key: 'sk-test'
        }
    }), {
        provider: 'openai',
        apiKey: 'sk-test'
    });
});

test('resolveSummaryModel uses the selected provider model when configured', () => {
    assert.equal(resolveSummaryModel({
        ai: {
            provider: 'openai',
            model: 'o4-mini'
        }
    }), 'o4-mini');

    assert.equal(resolveSummaryModel({
        ai: {
            provider: 'openai',
            model: 'gpt-4o'
        }
    }), 'gpt-4o');

    assert.equal(resolveSummaryModel({
        ai: {
            provider: 'nvidia',
            model: 'meta/llama-3.3-70b-instruct'
        }
    }), 'meta/llama-3.3-70b-instruct');
});

test('hasSummaryProviderConfigured checks summary credentials', () => {
    assert.equal(hasSummaryProviderConfigured({
        ai: {
            enabled: true,
            provider: 'nvidia',
            api_key: 'test-provider-key'
        }
    }), true);
});

const testSettings = { ai: { enabled: true, provider: 'openai', model: 'gpt-4o-mini', api_key: 'test-key' } };

test('retries a nonempty truncated explanation and returns only the complete result', async (t) => {
    const bodies = [];
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ choices: [{
            finish_reason: bodies.length === 1 ? 'length' : 'stop',
            message: { content: bodies.length === 1 ? 'The payment is due on' : 'The payment is due on Friday. Send confirmation after paying.' }
        }] }) };
    });
    const result = await summarizeWithProvider({ settings: testSettings, prompt: 'Explain this email.' });
    assert.equal(result, 'The payment is due on Friday. Send confirmation after paying.');
    assert.equal(bodies.length, 2);
    assert.ok(bodies[1].max_tokens > bodies[0].max_tokens);
});

test('never accepts a still-truncated retry as a finished explanation', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({
        choices: [{ finish_reason: 'length', message: { content: 'Incomplete explanation that' } }]
    }) }));
    await assert.rejects(summarizeWithProvider({ settings: testSettings, prompt: 'Explain this email.' }), /cut off/);
});

test('Anthropic detects and retries token-limited explanations', async (t) => {
    const bodies = [];
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({
            stop_reason: bodies.length === 1 ? 'max_tokens' : 'end_turn',
            content: [{ type: 'text', text: bodies.length === 1 ? 'Partial' : 'Complete explanation.' }]
        }) };
    });
    const settings = { ai: { enabled: true, provider: 'anthropic', model: 'claude-haiku-4-5', api_key: 'test-key' } };
    assert.equal(await summarizeWithProvider({ settings, prompt: 'Explain.' }), 'Complete explanation.');
    assert.equal(bodies[1].max_tokens, 6000);
});

test('expanded retry preserves provider parameter compatibility adjustments', async (t) => {
    const bodies = [];
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const body = JSON.parse(options.body);
        bodies.push(body);
        if (bodies.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: 'Use max_completion_tokens instead of max_tokens' } }) };
        return { ok: true, status: 200, json: async () => ({ choices: [{
            finish_reason: bodies.length === 2 ? 'length' : 'stop', message: { content: 'Explanation.' }
        }] }) };
    });
    assert.equal(await summarizeWithProvider({ settings: testSettings, prompt: 'Explain.' }), 'Explanation.');
    assert.equal(bodies[2].max_completion_tokens, 6000);
    assert.equal('max_tokens' in bodies[2], false);
});
