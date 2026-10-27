// Fish Audio voice library (public voices with cover art), cached briefly so the
// player's voice picker does not hammer the API on every open.
const VOICES_URL = 'https://api.fish.audio/model?page_size=60&sort_by=score';
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map();

const fishKeyFor = (settings = {}) => String(settings.tts?.fishaudio_key || '').trim();

const mapVoice = (item = {}) => ({
    id: String(item._id || item.id || '').trim(),
    name: String(item.title || '').trim() || 'Voice',
    cover_image: String(item.cover_image || '').trim(),
    languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
    tags: Array.isArray(item.tags) ? item.tags.map(String) : []
});

export const listFishAudioVoices = async (settings = {}) => {
    const key = fishKeyFor(settings);
    const activeVoiceId = String(settings.tts?.fishaudio_voice || '').trim();
    if (!key) {
        return { voices: [], activeVoiceId, error: 'no-key' };
    }

    const cacheKey = key.slice(-12);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return { voices: cached.voices, activeVoiceId };
    }

    const response = await fetch(VOICES_URL, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
        throw new Error(`Fish Audio voice list failed (HTTP ${response.status})`);
    }

    const payload = await response.json().catch(() => ({}));
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const english = [];
    const others = [];
    const seen = new Set();
    for (const item of items) {
        const voice = mapVoice(item);
        if (!voice.id || seen.has(voice.id)) {
            continue;
        }
        seen.add(voice.id);
        const langs = voice.languages.map((value) => value.toLowerCase());
        if (!langs.length || langs.includes('en')) {
            english.push(voice);
        } else {
            others.push(voice);
        }
    }

    // Always surface the account's current voice, even if it is not in the top list.
    if (activeVoiceId && !seen.has(activeVoiceId)) {
        english.unshift({
            id: activeVoiceId,
            name: 'Current voice',
            cover_image: '',
            languages: [],
            tags: []
        });
    }

    const voices = [...english, ...others];
    cache.set(cacheKey, { at: Date.now(), voices });
    return { voices, activeVoiceId };
};
