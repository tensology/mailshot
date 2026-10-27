// Fish Audio voice library (public voices with cover art), cached briefly so the
// player's voice picker does not hammer the API on every open.
const VOICES_URL = 'https://api.fish.audio/model?page_size=60&sort_by=score';
const DETAIL_URL = 'https://api.fish.audio/model/';
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map();

const fishKeyFor = (settings = {}) => String(settings.tts?.fishaudio_key || '').trim();

// Fish's cover_image paths are not publicly served, so give every voice a stable
// character face seeded from its id (client can swap this later).
const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/avataaars/svg';
const avatarFor = (seed) => `${DICEBEAR_BASE}?seed=${encodeURIComponent(String(seed || 'voice'))}&backgroundType=gradientLinear`;

const mapVoice = (item = {}) => {
    const id = String(item._id || item.id || '').trim();
    const name = String(item.title || '').trim() || 'Voice';
    return {
        id,
        name,
        cover_image: String(item.cover_image || '').trim(),
        avatar_url: avatarFor(id || name),
        languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
        tags: Array.isArray(item.tags) ? item.tags.map(String) : []
    };
};

const fetchVoiceDetail = async (key, id) => {
    try {
        const response = await fetch(`${DETAIL_URL}${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            return null;
        }
        const voice = mapVoice(await response.json().catch(() => ({})));
        return voice.id ? voice : null;
    } catch {
        return null;
    }
};

export const listFishAudioVoices = async (settings = {}) => {
    const key = fishKeyFor(settings);
    const activeVoiceId = String(settings.tts?.fishaudio_voice || '').trim();
    const defaultVoiceId = String(settings.tts?.fishaudio_default_voice || '').trim();
    if (!key) {
        return { voices: [], activeVoiceId, defaultVoiceId, error: 'no-key' };
    }

    const cacheKey = key.slice(-12);
    let library = cache.get(cacheKey);
    if (!library || Date.now() - library.at >= CACHE_TTL_MS) {
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
        library = { at: Date.now(), english, others };
        cache.set(cacheKey, library);
    }

    const inLibrary = (id) => (
        library.english.some((voice) => voice.id === id) || library.others.some((voice) => voice.id === id)
    );

    // Pin the default voice (and the current voice if it is not in the library)
    // at the top so the app default is always selectable.
    const pinnedIds = [];
    if (defaultVoiceId && !inLibrary(defaultVoiceId)) {
        pinnedIds.push(defaultVoiceId);
    }
    if (activeVoiceId && activeVoiceId !== defaultVoiceId && !inLibrary(activeVoiceId)) {
        pinnedIds.push(activeVoiceId);
    }

    const pinned = [];
    for (const id of pinnedIds) {
        const detail = await fetchVoiceDetail(key, id);
        pinned.push(detail || {
            id,
            name: id === defaultVoiceId ? 'Default voice' : 'Current voice',
            cover_image: '',
            avatar_url: avatarFor(id),
            languages: [],
            tags: []
        });
    }

    const markDefault = (voice) => ({
        ...voice,
        is_default: Boolean(defaultVoiceId) && voice.id === defaultVoiceId
    });

    return {
        voices: [
            ...pinned.map(markDefault),
            ...library.english.map(markDefault),
            ...library.others.map(markDefault)
        ],
        activeVoiceId,
        defaultVoiceId
    };
};
