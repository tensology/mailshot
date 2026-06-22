import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Volume2, X } from 'lucide-react';
import API from '../services/api';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';
import { getAuthToken, useAuth } from './AuthContext';
import IconButton from '../components/ui/IconButton';
import Toast from '../components/ui/Toast';

const playbackRates = [0.75, 1, 1.25, 1.5, 2];
const POLL_MS = 2500;

const ReadSummaryContext = createContext(null);

const buildAudioUrl = (job) => {
    if (!job?.audio_url) {
        return '';
    }

    const base = String(API_URL || '').replace(/\/$/, '');
    const pathPart = String(job.audio_url).startsWith('/') ? job.audio_url : `/${job.audio_url}`;
    const token = getAuthToken();
    const separator = pathPart.includes('?') ? '&' : '?';
    return `${base}${pathPart}${separator}auth_token=${encodeURIComponent(token)}`;
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

const ReadSummaryPlayer = ({ job, audioUrl, isPreparing, onClose }) => {
    const [rate, setRate] = useState(1);

    const updateRate = (event) => {
        const nextRate = Number(event.target.value);
        setRate(nextRate);
        const audio = document.getElementById('read-summary-audio');
        if (audio) {
            audio.playbackRate = nextRate;
        }
    };

    return (
        <div className="fixed bottom-4 left-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="mb-2 flex items-start gap-2">
                <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Read summary</p>
                    {job?.summary && <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{job.summary}</p>}
                    {isPreparing && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Preparing next summary
                        </p>
                    )}
                </div>
                <IconButton label="Close player" size="sm" onClick={onClose}>
                    <X className="h-4 w-4" />
                </IconButton>
            </div>
            <audio
                id="read-summary-audio"
                src={audioUrl || undefined}
                controls
                autoPlay={Boolean(audioUrl)}
                className="w-full"
                onLoadedMetadata={(event) => {
                    event.currentTarget.playbackRate = rate;
                }}
            />
            {!audioUrl && (
                <p className="mt-2 text-xs text-amber-700">Audio file is not available yet.</p>
            )}
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <span>Speed</span>
                <select
                    value={rate}
                    onChange={updateRate}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                    {playbackRates.map((value) => (
                        <option key={value} value={value}>{value}x</option>
                    ))}
                </select>
            </label>
        </div>
    );
};

const ReadSummaryPreparing = ({ message = 'Preparing read summary', summary = '' }) => (
    <div className="fixed bottom-4 left-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-blue-100 bg-white p-3 shadow-2xl">
        <div className="flex items-start gap-2 text-sm font-medium text-blue-700">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            <div className="min-w-0">
                <p>{message}</p>
                {summary && <p className="mt-2 line-clamp-4 text-xs font-normal leading-5 text-slate-600">{summary}</p>}
            </div>
        </div>
    </div>
);

export const ReadSummaryProvider = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const [enabled, setEnabled] = useState(false);
    const [playerJob, setPlayerJob] = useState(null);
    const [pendingEmailId, setPendingEmailId] = useState('');
    const [pendingJobId, setPendingJobId] = useState('');
    const [preparingMessage, setPreparingMessage] = useState('Preparing read summary');
    const [preparingSummary, setPreparingSummary] = useState('');
    const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
    const pendingJobIdRef = useRef('');
    const pollTimerRef = useRef(null);

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
        setPreparingMessage(options.audioReady ? 'Loading audio…' : 'Preparing read summary');
        setPreparingSummary(options.summaryPreview || '');
        setPendingEmailId(emailId);

        const result = await requestApi(API_URLS.startReadAloud, {}, emailId);
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

    const closePlayer = useCallback(() => {
        setPlayerJob(null);
    }, []);

    const audioUrl = buildAudioUrl(playerJob);
    const value = useMemo(() => ({
        enabled,
        pendingEmailId,
        pendingJobId,
        isPreparing: Boolean(pendingJobId || pendingEmailId),
        startReadSummary,
        refreshAvailability
    }), [enabled, pendingEmailId, pendingJobId, startReadSummary, refreshAvailability]);

    return (
        <ReadSummaryContext.Provider value={value}>
            {children}
            {playerJob?.status === 'ready' && (
                <ReadSummaryPlayer
                    job={playerJob}
                    audioUrl={audioUrl}
                    isPreparing={Boolean(pendingJobId || pendingEmailId)}
                    onClose={closePlayer}
                />
            )}
            {!playerJob && (pendingJobId || pendingEmailId) && (
                <ReadSummaryPreparing message={preparingMessage} summary={preparingSummary} />
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
