import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createPostgresLabelStore,
    createPostgresContactStore,
    createPostgresSettingsStore
} from './postgres-metadata-store.js';

test('label store seeds from cache when postgres is empty', async () => {
    const calls = [];
    const store = createPostgresLabelStore({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                if (/SELECT COUNT\(\*\)::int AS total FROM labels/i.test(text)) {
                    return { rows: [{ total: 0 }] };
                }
                if (/SELECT \* FROM labels/i.test(text)) {
                    return { rows: [{ id: 'label-travel', name: 'Travel', slug: 'travel', color: '#000' }] };
                }
                return { rows: [], rowCount: 1 };
            }
        },
        getCachedLabels: () => [{ _id: 'label-travel', name: 'Travel', slug: 'travel', color: '#000' }]
    });

    const labels = await store.list();

    assert.equal(labels.length, 1);
    assert.match(calls[1].text, /INSERT INTO labels/i);
});

test('contact store returns normalized contacts from postgres', async () => {
    const store = createPostgresContactStore({
        pool: {
            query: async () => ({
                rows: [{
                    id: 'contact-1',
                    name: 'Paul',
                    email: 'paul@example.com',
                    phone: '',
                    company: '',
                    notes: ''
                }]
            })
        },
        getCachedContacts: () => []
    });

    const contacts = await store.list();

    assert.deepEqual(contacts, [{
        _id: 'contact-1',
        name: 'Paul',
        email: 'paul@example.com',
        phone: '',
        company: '',
        notes: ''
    }]);
});

test('settings store seeds postgres from cached settings when empty', async () => {
    const calls = [];
    const cachedSettings = {
        general: { email: 'you@example.com' },
        ai: { enabled: false },
        autoresponder_log: []
    };
    const store = createPostgresSettingsStore({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                if (/SELECT\s+settings_json\s+FROM app_settings/i.test(text)) {
                    return { rows: [] };
                }
                return {
                    rows: [{
                        settings_json: cachedSettings
                    }],
                    rowCount: 1
                };
            }
        },
        getCachedSettings: () => cachedSettings
    });

    const settings = await store.get();

    assert.deepEqual(settings, cachedSettings);
    assert.ok(calls.some((call) => /INSERT INTO app_settings/i.test(call.text)));
});
