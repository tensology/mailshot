import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
        max_completion_tokens: 1000,
        reasoning_effort: 'low'
    });
});

test('standard models keep a small max_tokens budget', () => {
    assert.deepEqual(getCompletionRequestOptions('openai', 'gpt-4o-mini'), {
        max_tokens: 220
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
