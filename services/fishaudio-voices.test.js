import assert from 'node:assert/strict';
import { test } from 'node:test';

const HAYLEY = '8cb180b1ab9949e2bb59e1aaf9fa062c';
const ALICE = '11111111111111111111111111111111';
const BOB = '22222222222222222222222222222222';
const FISH_CDN = 'https://public-platform.r2.fish.audio';
let moduleId = 0;

const freshService = () => import(`./fishaudio-voices.js?test=${moduleId++}`);
const voice = (id, name, cover = `coverimage/${id}`, languages = ['en']) => ({ _id: id, title: name, cover_image: cover, languages, tags: ['narration'] });
const jsonResponse = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
const settings = (key = 'private-fish-key', activeVoiceId = '', defaultVoiceId = '') => ({ tts: { fishaudio_key: key, fishaudio_voice: activeVoiceId, fishaudio_default_voice: defaultVoiceId } });

test('real Fish profile covers use the fixed public CDN and expose an explicit fallback', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: [voice(ALICE, 'Alice Narrator'), voice(BOB, 'Bob Narrator', `${FISH_CDN}/coverimage/${BOB}`)] }));
    const { listFishAudioVoices } = await freshService();
    const result = await listFishAudioVoices(settings());
    assert.equal(result.voices[0].avatar_url, `${FISH_CDN}/cdn-cgi/image/width=144,format=webp/coverimage/${ALICE}`);
    assert.equal(result.voices[1].avatar_url, `${FISH_CDN}/cdn-cgi/image/width=144,format=webp/coverimage/${BOB}`);
    assert.equal(result.voices[0].avatar_source, 'fish');
    assert.equal(result.voices[0].name, 'Alice Narrator');
    assert.ok(result.voices[0].avatar_fallback_url.startsWith('https://api.dicebear.com/9.x/avataaars/svg?'));
    assert.equal(result.voices[0].cover_image, `coverimage/${ALICE}`);
    assert.deepEqual(result.voices[0].languages, ['en']);
    assert.deepEqual(result.voices[0].tags, ['narration']);
});

test('Hayley retains Mailshot’s exact approved portrait rather than provider artwork', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: [voice(HAYLEY, 'Hayley Williams')] }));
    const { listFishAudioVoices } = await freshService();
    const result = await listFishAudioVoices(settings('key', HAYLEY, HAYLEY));
    assert.equal(result.voices.length, 1);
    assert.equal(result.voices[0].avatar_url, '/voice-hayley.png');
    assert.equal(result.voices[0].avatar_source, 'mailshot');
    assert.equal(result.voices[0].name, 'Hayley Williams');
    assert.equal(result.voices[0].is_default, true);
});

test('unsafe cover URLs never reach public response fields or trigger image requests', async (t) => {
    const unsafe = [
        'http://127.0.0.1/private', 'https://127.0.0.1/private', '//evil.test/image',
        `${FISH_CDN}.evil.test/coverimage/${ALICE}`, `${FISH_CDN}/coverimage/${ALICE}?token=private-token`,
        `https://user:password@public-platform.r2.fish.audio/coverimage/${ALICE}`,
        `https://public-platform.r2.fish.audio:8443/coverimage/${ALICE}`,
        `https://public-platform.r2.fish.audio:invalid/coverimage/${ALICE}`,
        `coverimage/${BOB}`, `coverimage/${ALICE}/../../private`, 'javascript:alert(1)',
    ];
    for (const cover of unsafe) {
        const fetch = t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: [voice(ALICE, 'Alice', cover)] }));
        const { listFishAudioVoices } = await freshService();
        const result = await listFishAudioVoices(settings());
        assert.equal(result.voices[0].avatar_source, 'generated', cover);
        assert.ok(result.voices[0].avatar_url.startsWith('https://api.dicebear.com/'), cover);
        assert.equal(result.voices[0].cover_image, '', cover);
        assert.equal(fetch.mock.callCount(), 1);
        fetch.mock.restore();
    }
});

test('default and current voices stay pinned before an English-first library without duplicates', async (t) => {
    const foreign = '33333333333333333333333333333333';
    const english = '44444444444444444444444444444444';
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: [
        voice(foreign, 'Other language', '', ['fr']), voice(english, 'English'),
        voice(BOB, 'Current'), voice(ALICE, 'Default'), voice(ALICE, 'Duplicate'),
    ] }));
    const { listFishAudioVoices } = await freshService();
    const result = await listFishAudioVoices(settings('key', BOB, ALICE));
    assert.deepEqual(result.voices.map((item) => item.id), [ALICE, BOB, english, foreign]);
    assert.equal(result.activeVoiceId, BOB);
    assert.equal(result.defaultVoiceId, ALICE);
    assert.equal(result.voices[0].is_default, true);
});

test('a selected voice missing from the first sixty results is fetched safely and pinned', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url) => url.includes('?')
        ? jsonResponse({ items: [voice(ALICE, 'Alice')] })
        : jsonResponse(voice(BOB, 'Bob selected')));
    const { listFishAudioVoices } = await freshService();
    const result = await listFishAudioVoices(settings('private-key', BOB));
    assert.deepEqual(result.voices.map((item) => item.id), [BOB, ALICE]);
    assert.equal(result.voices[0].name, 'Bob selected');
    assert.equal(fetch.mock.calls[1].arguments[0], `https://api.fish.audio/model/${BOB}`);
    assert.equal(fetch.mock.calls[1].arguments[1].headers.Authorization, 'Bearer private-key');
    assert.equal(fetch.mock.calls[1].arguments[1].redirect, 'error');
    assert.ok(!JSON.stringify(result).includes('private-key'));
});

test('catalog caches distinguish full credentials even when their last twelve characters match', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: [voice(ALICE, 'Alice')] }));
    const { listFishAudioVoices } = await freshService();
    await listFishAudioVoices(settings('first-abcdefghijkl'));
    await listFishAudioVoices(settings('first-abcdefghijkl'));
    await listFishAudioVoices(settings('second-abcdefghijkl'));
    assert.equal(fetch.mock.callCount(), 2);
});

test('missing portrait data has the stable Mailshot fallback and malformed voices are skipped', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: [null, {}, voice('invalid-id', 'Bad ID'), voice(ALICE, 'Alice', '')] }));
    const { listFishAudioVoices } = await freshService();
    const result = await listFishAudioVoices(settings());
    assert.equal(result.voices.length, 1);
    assert.equal(result.voices[0].avatar_source, 'generated');
    assert.equal(result.voices[0].avatar_url, result.voices[0].avatar_fallback_url);
});

test('the first sixty library items remain bounded', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({ items: Array.from({ length: 65 }, (_, index) => voice(index.toString(16).padStart(32, '0'), `Voice ${index}`)) }));
    const { listFishAudioVoices } = await freshService();
    assert.equal((await listFishAudioVoices(settings())).voices.length, 60);
});

test('unavailable selected Hayley still has her matching name and portrait', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url) => url.includes('?') ? jsonResponse({ items: [] }) : jsonResponse({}, 404));
    const { listFishAudioVoices } = await freshService();
    const result = await listFishAudioVoices(settings('key', HAYLEY, HAYLEY));
    assert.equal(result.voices[0].name, 'Hayley Williams');
    assert.equal(result.voices[0].avatar_url, '/voice-hayley.png');
    assert.equal(result.voices[0].avatar_source, 'mailshot');
});

test('missing credentials return the existing safe catalog contract without network access', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected provider request'));
    const { listFishAudioVoices } = await freshService();
    assert.deepEqual(await listFishAudioVoices(settings('', ALICE, BOB)), { voices: [], activeVoiceId: ALICE, defaultVoiceId: BOB, error: 'no-key' });
    assert.equal(fetch.mock.callCount(), 0);
});

test('provider network errors cannot leak API credentials through the controller error message', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('private-key must never escape'); });
    const { listFishAudioVoices } = await freshService();
    await assert.rejects(listFishAudioVoices(settings('private-key')), {
        message: 'Fish Audio voices could not be loaded. Please try again.',
    });
});
