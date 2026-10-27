// Fish Audio voice library (public voices with cover art), cached briefly so the
// player's voice picker does not hammer the API on every open.
const VOICES_URL = 'https://api.fish.audio/model?page_size=60&sort_by=score';
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
            avatar_url: avatarFor(activeVoiceId),
            languages: [],
            tags: []
        });
    }

    const voices = [...english, ...others];
    cache.set(cacheKey, { at: Date.now(), voices });
    return { voices, activeVoiceId };
};
