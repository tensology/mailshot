// Fish Audio voice library (public voices with cover art), cached briefly so the
// player's voice picker does not hammer the API on every open.
import { createHash } from 'node:crypto';

const VOICES_URL = 'https://api.fish.audio/model?page_size=60&sort_by=score';
const DETAIL_URL = 'https://api.fish.audio/model/';
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map();

const fishKeyFor = (settings = {}) => String(settings.tts?.fishaudio_key || '').trim();

// Fish's public website serves these exact cover paths through its image CDN.
const FISH_CDN = 'https://public-platform.r2.fish.audio';
const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/avataaars/svg';
const avatarFor = (seed) => `${DICEBEAR_BASE}?seed=${encodeURIComponent(String(seed || 'voice'))}&backgroundType=gradientLinear`;
const validVoiceId = (value) => /^[a-f0-9]{32}$/.test(value);

const fishCoverFor = (id, cover = '') => {
    if (!validVoiceId(id) || typeof cover !== 'string') return '';
    let imagePath = cover.trim();
    if (imagePath.startsWith('https://')) {
        try {
            const url = new URL(imagePath);
            if (url.origin !== FISH_CDN || url.username || url.password || url.search || url.hash) return '';
            imagePath = url.pathname.replace(/^\//, '');
        } catch {
            return '';
        }
    }
    if (imagePath !== `coverimage/${id}`) return '';
    return `${FISH_CDN}/cdn-cgi/image/width=144,format=webp/coverimage/${id}`;
};

// Voices with a hand-picked character image (served from the client's /public).
const CUSTOM_AVATARS = {
    '8cb180b1ab9949e2bb59e1aaf9fa062c': '/voice-hayley.png' // Hayley Williams (Decisions AI)
};
const avatarForVoice = (id, cover) => CUSTOM_AVATARS[id] || fishCoverFor(id, cover) || avatarFor(id);

const mapVoice = (item = {}) => {
    if (!item || typeof item !== 'object') return null;
    const id = String(item._id || item.id || '').trim().toLowerCase();
    if (!validVoiceId(id)) return null;
    const name = String(item.title || '').trim() || 'Voice';
    const cover = fishCoverFor(id, item.cover_image);
    return {
        id,
        name,
        cover_image: cover ? `coverimage/${id}` : '',
        avatar_url: avatarForVoice(id, item.cover_image),
        avatar_fallback_url: avatarFor(id),
        avatar_source: CUSTOM_AVATARS[id] ? 'mailshot' : cover ? 'fish' : 'generated',
        languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
        tags: Array.isArray(item.tags) ? item.tags.map(String) : []
    };
};

const fetchVoiceDetail = async (key, id) => {
    try {
        const response = await fetch(`${DETAIL_URL}${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${key}` },
            redirect: 'error',
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            return null;
        }
        const voice = mapVoice(await response.json().catch(() => ({})));
        return voice?.id === id ? voice : null;
    } catch {
        return null;
    }
};

export const listFishAudioVoices = async (settings = {}) => {
    const key = fishKeyFor(settings);
    const active = String(settings.tts?.fishaudio_voice || '').trim().toLowerCase();
    const preferredDefault = String(settings.tts?.fishaudio_default_voice || '').trim().toLowerCase();
    const activeVoiceId = validVoiceId(active) ? active : '';
    const defaultVoiceId = validVoiceId(preferredDefault) ? preferredDefault : '';
    if (!key) {
        return { voices: [], activeVoiceId, defaultVoiceId, error: 'no-key' };
    }

    const cacheKey = createHash('sha256').update(key).digest('hex');
    let library = cache.get(cacheKey);
    if (!library || Date.now() - library.at >= CACHE_TTL_MS) {
        let response;
        try {
            response = await fetch(VOICES_URL, {
                headers: { Authorization: `Bearer ${key}` },
                redirect: 'error',
                signal: AbortSignal.timeout(15000)
            });
        } catch {
            throw new Error('Fish Audio voices could not be loaded. Please try again.');
        }
        if (!response.ok) {
            throw new Error(`Fish Audio voice list failed (HTTP ${response.status})`);
        }
        const payload = await response.json().catch(() => ({}));
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const english = [];
        const others = [];
        const seen = new Set();
        for (const item of items.slice(0, 60)) {
            const voice = mapVoice(item);
            if (!voice?.id || seen.has(voice.id)) {
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

    const voices = [...library.english, ...library.others];
    const byId = new Map(voices.map((voice) => [voice.id, voice]));
    // Default and current voices stay at the top, including when already in the library.
    const pinnedIds = [...new Set([defaultVoiceId, activeVoiceId].filter(Boolean))];

    const pinned = [];
    for (const id of pinnedIds) {
        const detail = byId.get(id) || await fetchVoiceDetail(key, id);
        pinned.push(detail || {
            id,
            name: CUSTOM_AVATARS[id] ? 'Hayley Williams' : id === defaultVoiceId ? 'Default voice' : 'Current voice',
            cover_image: '',
            avatar_url: avatarForVoice(id),
            avatar_fallback_url: avatarFor(id),
            avatar_source: CUSTOM_AVATARS[id] ? 'mailshot' : 'generated',
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
            ...voices.filter((voice) => !pinnedIds.includes(voice.id)).map(markDefault)
        ],
        activeVoiceId,
        defaultVoiceId
    };
};
