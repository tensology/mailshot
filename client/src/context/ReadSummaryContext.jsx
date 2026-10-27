import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';
import { getAuthToken, useAuth } from './AuthContext';
import IconButton from '../components/ui/IconButton';
import Toast from '../components/ui/Toast';
import MailshotIcon from '../components/ui/MailshotIcon';
import {
    clampReadSummaryPosition,
    getDefaultReadSummaryPosition
} from '../utils/readSummaryPanel';

const playbackRates = [0.75, 1, 1.25, 1.5, 2];
const POLL_MS = 2500;

const ReadSummaryContext = createContext(null);
const PANEL_STORAGE_KEY = 'mailshot:read-summary-panel-position';

const buildAudioRequestUrl = (job) => {
    if (!job?.audio_url) {
        return '';
    }

    const base = String(API_URL || '').replace(/\/$/, '');
    const pathPart = String(job.audio_url).startsWith('/') ? job.audio_url : `/${job.audio_url}`;
    return `${base}${pathPart}`;
};

const fetchAuthorizedAudioBlobUrl = async (job) => {
    const url = buildAudioRequestUrl(job);
    if (!url) {
        return '';
    }

    const token = getAuthToken();
    // The audio URL is stable per cache key, so bust caches when the clip is rebuilt.
    const bustedUrl = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
    const response = await fetch(bustedUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error('Could not load read summary audio');
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
};

const isJobPayload = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const requestApi = async (urlObject, payload = {}, type = '') => {
    try {
        const response = await API(urlObject, payload, type);
        return { data: response.data, error: '' };
    } catch (error) {
        return {
            data: null,
            error: error?.response?.data?.message || error?.response?.data || error?.message || 'Request failed'
        };
    }
};

const readStoredPanelPosition = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const parsed = JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) || 'null');
        return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? parsed : null;
    } catch {
        return null;
    }
};

const storePanelPosition = (position) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(position));
    } catch {
        // Ignore storage failures; dragging should still work for this session.
    }
};

const ReadSummaryShell = ({ children, tone = 'default' }) => (
    <div
        className={`fixed bottom-4 left-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-slate-900 p-4 text-white shadow-2xl ${
            tone === 'preparing' ? 'border-blue-500/40' : 'border-slate-800'
        }`}
    >
        {children}
    </div>
);

const formatClock = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const VoiceAvatar = ({ voice, size = 40 }) => {
    const [failed, setFailed] = useState(false);
    const src = voice?.avatar_url || voice?.cover_image || '';

    if (!src || failed) {
        return (
            <span className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                <MailshotIcon name="headphones" size={Math.round(size * 0.7)} />
            </span>
        );
    }

    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
};

const ReadSummaryPlayer = ({
    job,
    audioUrl,
    isPreparing,
    onClose,
    panelRef,
    position,
    onDragStart,
    voices = [],
    activeVoiceId = '',
    onSelectVoice,
    voicesLoading = false
}) => {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [rate, setRate] = useState(1);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [query, setQuery] = useState('');

    const activeVoice = voices.find((voice) => voice.id === activeVoiceId) || null;
    const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
    const normalizedQuery = query.trim().toLowerCase();
    const filteredVoices = normalizedQuery
        ? voices.filter((voice) => voice.name.toLowerCase().includes(normalizedQuery))
        : voices;

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (audio.paused) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    };

    const seek = (event) => {
        const value = Number(event.target.value);
        const audio = audioRef.current;
        if (audio && Number.isFinite(value)) {
            audio.currentTime = value;
        }
        setCurrent(value);
    };

    const changeRate = (event) => {
        const next = Number(event.target.value);
        setRate(next);
        if (audioRef.current) {
            audioRef.current.playbackRate = next;
        }
    };

    return (
        <ReadSummaryShell>
            <audio
                ref={audioRef}
                src={audioUrl || undefined}
                autoPlay={Boolean(audioUrl)}
                onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) => {
                    setDuration(event.currentTarget.duration || 0);
                    event.currentTarget.playbackRate = rate;
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
            />

            <div className="flex items-center gap-3">
                <div className="shrink-0">
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="h-14 w-14 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-lg transition hover:border-slate-500"
                        title="Change voice"
                        aria-label="Change voice"
                    >
                        <VoiceAvatar voice={activeVoice} size={56} />
                    </button>
                </div>

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{activeVoice?.name || 'Read summary'}</p>
                    <p className="truncate text-xs text-slate-400">{isPreparing ? 'Preparing…' : 'Fish Audio · read summary'}</p>
                </div>

                <IconButton label="Close player" size="sm" onClick={onClose} className="shrink-0 self-start text-slate-300 hover:bg-slate-800">
                    <MailshotIcon name="close" size={20} />
                </IconButton>
            </div>

            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!audioUrl}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow transition hover:scale-105 disabled:opacity-40"
                    aria-label={playing ? 'Pause' : 'Play'}
                >
                    {playing
                        ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                        : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                </button>

                <div className="min-w-0 flex-1">
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        step="0.1"
                        value={Math.min(current, duration || 0)}
                        onChange={seek}
                        disabled={!audioUrl || !duration}
                        aria-label="Seek"
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:opacity-40"
                        style={{ background: `linear-gradient(to right, #ffffff ${progress}%, #334155 ${progress}%)` }}
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-slate-400">
                        <span>{formatClock(current)}</span>
                        <span>{formatClock(duration)}</span>
                    </div>
                </div>

                <select
                    value={rate}
                    onChange={changeRate}
                    className="h-8 shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                    aria-label="Playback speed"
                >
                    {playbackRates.map((value) => (
                        <option key={value} value={value}>{value}x</option>
                    ))}
                </select>
            </div>

            {!audioUrl && <p className="mt-2 text-xs text-amber-400">Audio file is not available yet.</p>}

            {pickerOpen && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
                    onClick={() => setPickerOpen(false)}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <h2 className="text-base font-semibold text-slate-900">Choose a voice</h2>
                            <IconButton label="Close" size="sm" onClick={() => setPickerOpen(false)}>
                                <MailshotIcon name="close" size={20} />
                            </IconButton>
                        </div>
                        <div className="border-b border-slate-100 px-4 py-3">
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search voices"
                                autoFocus
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
                            {voicesLoading && <p className="py-6 text-center text-sm text-slate-500">Loading voices…</p>}
                            {!voicesLoading && !filteredVoices.length && (
                                <p className="py-6 text-center text-sm text-slate-500">
                                    {query ? `No voices match “${query}”.` : 'No voices available.'}
                                </p>
                            )}
                            {!voicesLoading && filteredVoices.length > 0 && (
                                <div className="grid auto-rows-fr grid-cols-3 gap-3 sm:grid-cols-4">
                                    {filteredVoices.map((voice) => {
                                        const isActive = voice.id === activeVoiceId;
                                        return (
                                            <button
                                                key={voice.id}
                                                type="button"
                                                onClick={() => {
                                                    setPickerOpen(false);
                                                    onSelectVoice?.(voice.id);
                                                }}
                                                className={`flex h-full flex-col items-center justify-start gap-2 rounded-xl p-2 transition ${isActive ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}
                                            >
                                                <span className={`h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 ${isActive ? 'border-blue-400' : 'border-slate-200'}`}>
                                                    <VoiceAvatar voice={voice} size={80} />
                                                </span>
                                                <span className="line-clamp-2 min-h-[2.5rem] text-center text-xs font-medium text-slate-700">{voice.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </ReadSummaryShell>
    );
};


const ReadSummaryPreparing = ({ message = 'Preparing read summary', summary = '' }) => (
    <ReadSummaryShell tone="preparing">
        <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 shadow-lg">
                <MailshotIcon name="refresh" size={28} active />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{message}</p>
                {summary && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{summary}</p>}
            </div>
        </div>
    </ReadSummaryShell>
);

export const ReadSummaryProvider = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const [enabled, setEnabled] = useState(false);
    const [playerJob, setPlayerJob] = useState(null);
    const [audioUrl, setAudioUrl] = useState('');
    const [pendingEmailId, setPendingEmailId] = useState('');
    const [pendingJobId, setPendingJobId] = useState('');
    const [preparingMessage, setPreparingMessage] = useState('Preparing read summary');
    const [preparingSummary, setPreparingSummary] = useState('');
    const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
    const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, emailId: '' });
    const [voices, setVoices] = useState([]);
    const [activeVoiceId, setActiveVoiceId] = useState('');
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [playerEmailId, setPlayerEmailId] = useState('');
    const panelRef = useRef(null);
    const voicesLoadedRef = useRef(false);
    const dragRef = useRef(null);
    const pendingJobIdRef = useRef('');
    const pollTimerRef = useRef(null);
    const [panelPosition, setPanelPosition] = useState(() => (
        readStoredPanelPosition() || getDefaultReadSummaryPosition({
            viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
            viewportHeight: typeof window === 'undefined' ? 0 : window.innerHeight
        })
    ));

    const getPanelBounds = useCallback(() => {
        const rect = panelRef.current?.getBoundingClientRect();
        return {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            panelWidth: rect?.width || 384,
            panelHeight: rect?.height || 160
        };
    }, []);

    const updatePanelPosition = useCallback((nextPosition, persist = false) => {
        const clamped = clampReadSummaryPosition({
            ...nextPosition,
            ...getPanelBounds()
        });
        setPanelPosition(clamped);
        if (persist) {
            storePanelPosition(clamped);
        }
        return clamped;
    }, [getPanelBounds]);

    const startPanelDrag = useCallback((event) => {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: panelPosition
        };
    }, [panelPosition]);

    useEffect(() => {
        const onPointerMove = (event) => {
            const drag = dragRef.current;
            if (!drag) {
                return;
            }

            updatePanelPosition({
                x: drag.origin.x + event.clientX - drag.startX,
                y: drag.origin.y + event.clientY - drag.startY
            });
        };

        const onPointerUp = (event) => {
            if (!dragRef.current) {
                return;
            }
            const drag = dragRef.current;
            dragRef.current = null;
            updatePanelPosition({
                x: drag.origin.x + event.clientX - drag.startX,
                y: drag.origin.y + event.clientY - drag.startY
            }, true);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
        };
    }, [updatePanelPosition]);

    useEffect(() => {
        const onResize = () => updatePanelPosition(panelPosition, true);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [panelPosition, updatePanelPosition]);

    const clearPollTimer = useCallback(() => {
        if (pollTimerRef.current) {
            window.clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const refreshAvailability = useCallback(async () => {
        if (!isAuthenticated || !getAuthToken()) {
            setEnabled(false);
            return;
        }

        const result = await requestApi(API_URLS.getSettings, {}, '');
        setEnabled(Boolean(result.data?.permissions?.read_aloud_enabled));
    }, [isAuthenticated]);

    useEffect(() => {
        refreshAvailability().catch(() => setEnabled(false));
    }, [refreshAvailability]);

    useEffect(() => {
        const onSettingsChanged = () => {
            refreshAvailability().catch(() => setEnabled(false));
        };

        window.addEventListener('mailshot:settings-updated', onSettingsChanged);
        return () => window.removeEventListener('mailshot:settings-updated', onSettingsChanged);
    }, [refreshAvailability]);

    useEffect(() => () => clearPollTimer(), [clearPollTimer]);

    const handleError = useCallback((message) => {
        setPendingEmailId('');
        setPendingJobId('');
        setPreparingMessage('Preparing read summary');
        setPreparingSummary('');
        pendingJobIdRef.current = '';
        setToast({ open: true, message: message || 'Could not prepare read summary', severity: 'error' });
    }, []);

    const applyReadyJob = useCallback((job) => {
        setPlayerJob(job);
        setPendingEmailId('');
        setPendingJobId('');
        setPreparingMessage('Preparing read summary');
        setPreparingSummary('');
        pendingJobIdRef.current = '';
    }, []);

    const pollJob = useCallback(async (jobId) => {
        const result = await requestApi(API_URLS.getReadAloudJob, {}, jobId);
        if (pendingJobIdRef.current !== jobId) {
            return;
        }

        if (result.error) {
            handleError(result.error);
            return;
        }

        if (result.data?.status === 'ready') {
            applyReadyJob(result.data);
            return;
        }

        if (result.data?.summary) {
            setPreparingSummary(result.data.summary);
        }

        if (result.data?.status === 'error') {
            handleError(result.data.error || 'Could not generate read summary audio');
            return;
        }

        pollTimerRef.current = window.setTimeout(() => {
            pollJob(jobId);
        }, POLL_MS);
    }, [applyReadyJob, handleError]);

    const startReadSummary = useCallback(async (emailId, options = {}) => {
        if (!emailId) {
            return { error: 'No email selected' };
        }

        clearPollTimer();
        setPlayerEmailId(emailId);
        if (options.force) {
            // Drop the current clip so the stale audio can't keep playing during the rebuild.
            setPlayerJob(null);
        }
        setPreparingMessage(options.audioReady ? 'Loading audio…' : 'Preparing read summary');
        setPreparingSummary(options.summaryPreview || '');
        setPendingEmailId(emailId);

        const result = await requestApi(API_URLS.startReadAloud, { force: Boolean(options.force) }, emailId);
        if (!isJobPayload(result.data)) {
            const message = result.error || 'Could not prepare read summary';
            handleError(message);
            return { error: message };
        }

        if (result.data.status === 'ready') {
            applyReadyJob(result.data);
            return { data: result.data, error: '' };
        }

        if (result.data.status === 'error') {
            const message = result.data.error || 'Could not generate read summary audio';
            handleError(message);
            return { error: message };
        }

        if (result.data.summary) {
            setPreparingSummary(result.data.summary);
        }

        if (!result.data.job_id) {
            handleError('Read summary did not return a job id');
            return { error: 'Read summary did not return a job id' };
        }

        pendingJobIdRef.current = result.data.job_id;
        setPendingJobId(result.data.job_id);
        pollTimerRef.current = window.setTimeout(() => {
            pollJob(result.data.job_id);
        }, POLL_MS);
        return { data: result.data, error: '' };
    }, [applyReadyJob, clearPollTimer, handleError, pollJob]);

    const loadVoices = useCallback(async () => {
        setVoicesLoading(true);
        const result = await requestApi(API_URLS.getTtsVoices, {}, '');
        setVoicesLoading(false);
        if (result.error) {
            return;
        }
        setVoices(Array.isArray(result.data?.voices) ? result.data.voices : []);
        setActiveVoiceId(result.data?.active_voice_id || '');
    }, []);

    const selectVoice = useCallback(async (voiceId) => {
        if (!voiceId) {
            return;
        }
        const result = await requestApi(API_URLS.updateTtsVoice, { voice_id: voiceId }, '');
        if (result.error) {
            handleError(result.error);
            return;
        }
        setActiveVoiceId(result.data?.active_voice_id || voiceId);
        if (playerEmailId) {
            startReadSummary(playerEmailId, { force: true });
        }
    }, [handleError, playerEmailId, startReadSummary]);

    useEffect(() => {
        if (playerJob?.status === 'ready' && !voicesLoadedRef.current) {
            voicesLoadedRef.current = true;
            loadVoices();
        }
    }, [playerJob, loadVoices]);

    const closePlayer = useCallback(() => {
        setPlayerJob(null);
    }, []);

    const openReadSummaryMenu = useCallback((event, emailId) => {
        if (!emailId) {
            return;
        }
        event.preventDefault();
        const x = Math.min(event.clientX, Math.max(8, window.innerWidth - 220));
        const y = Math.min(event.clientY, Math.max(8, window.innerHeight - 64));
        setContextMenu({ open: true, x, y, emailId });
    }, []);

    useEffect(() => {
        if (!contextMenu.open) {
            return undefined;
        }
        const close = () => setContextMenu((menu) => ({ ...menu, open: false }));
        const onKey = (event) => {
            if (event.key === 'Escape') {
                close();
            }
        };
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('keydown', onKey);
        };
    }, [contextMenu.open]);

    useEffect(() => {
        let cancelled = false;
        const createdUrls = [];

        if (playerJob?.status !== 'ready' || !playerJob?.audio_url) {
            setAudioUrl('');
            return undefined;
        }

        fetchAuthorizedAudioBlobUrl(playerJob)
            .then((url) => {
                if (cancelled) {
                    URL.revokeObjectURL(url);
                    return;
                }
                createdUrls.push(url);
                setAudioUrl(url);
            })
            .catch((error) => {
                if (!cancelled) {
                    handleError(error?.message || 'Could not load read summary audio');
                    setPlayerJob(null);
                }
            });

        return () => {
            cancelled = true;
            createdUrls.forEach((url) => URL.revokeObjectURL(url));
            setAudioUrl('');
        };
    }, [handleError, playerJob]);

    const value = useMemo(() => ({
        enabled,
        pendingEmailId,
        pendingJobId,
        isPreparing: Boolean(pendingJobId || pendingEmailId),
        startReadSummary,
        openReadSummaryMenu,
        refreshAvailability
    }), [enabled, pendingEmailId, pendingJobId, startReadSummary, openReadSummaryMenu, refreshAvailability]);

    return (
        <ReadSummaryContext.Provider value={value}>
            {children}
            {playerJob?.status === 'ready' && (
                <ReadSummaryPlayer
                    job={playerJob}
                    audioUrl={audioUrl}
                    isPreparing={Boolean(pendingJobId || pendingEmailId)}
                    onClose={closePlayer}
                    panelRef={panelRef}
                    position={panelPosition}
                    onDragStart={startPanelDrag}
                    voices={voices}
                    activeVoiceId={activeVoiceId}
                    onSelectVoice={selectVoice}
                    voicesLoading={voicesLoading}
                />
            )}
            {!playerJob && (pendingJobId || pendingEmailId) && (
                <ReadSummaryPreparing
                    message={preparingMessage}
                    summary={preparingSummary}
                    panelRef={panelRef}
                    position={panelPosition}
                    onDragStart={startPanelDrag}
                />
            )}
            {contextMenu.open && (
                <div
                    role="menu"
                    className="fixed z-[90] min-w-[12rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-xl"
                    style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            const targetId = contextMenu.emailId;
                            setContextMenu((menu) => ({ ...menu, open: false }));
                            startReadSummary(targetId, { force: true });
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                    >
                        <MailshotIcon name="refresh" size={18} />
                        Rebuild summary
                    </button>
                </div>
            )}
            <Toast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast({ ...toast, open: false })}
            />
        </ReadSummaryContext.Provider>
    );
};

export const useReadSummary = () => {
    const context = useContext(ReadSummaryContext);
    if (!context) {
        throw new Error('useReadSummary must be used within ReadSummaryProvider');
    }
    return context;
};
