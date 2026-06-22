import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Check, Image, Italic, List, Plus, Save, Trash2, X } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Input from './ui/Input';
import Toast from './ui/Toast';

const DEFAULT_EMAIL = 'you@example.com';

const emptySignature = (email = DEFAULT_EMAIL) => ({
    email,
    signature_html: ''
});

const emptyAutoresponder = (email = DEFAULT_EMAIL) => ({
    email,
    enabled: false,
    subject: 'Re: {{subject}}',
    html: ''
});

const emptyGeneral = {
    email: DEFAULT_EMAIL,
    selected_email: DEFAULT_EMAIL,
    signatures: [emptySignature()],
    autoresponders: [emptyAutoresponder()],
    signature_html: '',
    autoresponder_enabled: false,
    autoresponder_html: '',
    autoresponder_subject: 'Re: {{subject}}'
};

const AI_PROVIDER_OPTIONS = {
    nvidia: { label: 'NVIDIA' },
    openai: { label: 'OpenAI' },
    anthropic: { label: 'Anthropic' },
    openrouter: { label: 'OpenRouter' },
    kilocode: { label: 'Kilo Code' }
};

const emptyAi = {
    enabled: false,
    provider: 'nvidia',
    api_key: '',
    api_keys: {},
    model: ''
};

const emptyTts = {
    voice: 'af_heart'
};

const KOKORO_VOICES = [
    { id: 'af_heart', label: 'Heart (American Female)' },
    { id: 'af_bella', label: 'Bella (American Female)' },
    { id: 'af_nicole', label: 'Nicole (American Female)' },
    { id: 'af_sarah', label: 'Sarah (American Female)' },
    { id: 'af_sky', label: 'Sky (American Female)' },
    { id: 'am_adam', label: 'Adam (American Male)' },
    { id: 'am_michael', label: 'Michael (American Male)' },
    { id: 'bf_emma', label: 'Emma (British Female)' },
    { id: 'bf_isabella', label: 'Isabella (British Female)' },
    { id: 'bm_george', label: 'George (British Male)' },
    { id: 'bm_lewis', label: 'Lewis (British Male)' }
];

const mergeProviderOptions = (providers = {}) => ({
    ...AI_PROVIDER_OPTIONS,
    ...providers
});

const normalizeAiProvider = (ai = {}, providers = AI_PROVIDER_OPTIONS) => {
    const next = { ...emptyAi, ...ai };
    if (!providers[next.provider]) {
        next.provider = Object.keys(providers)[0] || 'nvidia';
    }
    next.api_keys = {
        ...(ai.api_keys || {}),
        ...(ai.api_key ? { [next.provider]: ai.api_key } : {})
    };
    next.api_key = next.api_keys[next.provider] || '';
    return next;
};

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const uniqueEntriesByEmail = (entries, fallbackFactory) => {
    const byEmail = new Map();
    entries.forEach((entry) => {
        const email = normalizeEmail(entry.email);
        if (!email) return;
        byEmail.set(email, { ...entry, email });
    });
    if (!byEmail.size) {
        const fallback = fallbackFactory(DEFAULT_EMAIL);
        byEmail.set(DEFAULT_EMAIL, fallback);
    }
    return [...byEmail.values()];
};

const normalizeGeneral = (settings = {}) => {
    const selectedEmail = normalizeEmail(settings.selected_email || settings.email) || DEFAULT_EMAIL;
    const signatures = uniqueEntriesByEmail(
        Array.isArray(settings.signatures) && settings.signatures.length
            ? settings.signatures
            : [emptySignature(selectedEmail)],
        emptySignature
    );
    const autoresponders = uniqueEntriesByEmail(
        Array.isArray(settings.autoresponders) && settings.autoresponders.length
            ? settings.autoresponders
            : [emptyAutoresponder(selectedEmail)],
        emptyAutoresponder
    );

    return {
        ...emptyGeneral,
        ...settings,
        email: selectedEmail,
        selected_email: selectedEmail,
        signatures,
        autoresponders
    };
};

const isValidImageUrl = (value = '') => {
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

const RichTextEditor = ({ label, value, onChange, allowImages = false, placeholder = 'Write your signature here…' }) => {
    const editorRef = useRef(null);
    const [imageUrl, setImageUrl] = useState('');
    const [showImageInput, setShowImageInput] = useState(false);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const syncEditor = () => {
        onChange(editorRef.current?.innerHTML || '');
    };

    const applyCommand = (command) => {
        editorRef.current?.focus();
        document.execCommand(command, false, null);
        syncEditor();
    };

    const insertImage = () => {
        const url = imageUrl.trim();
        if (!isValidImageUrl(url)) {
            return false;
        }

        editorRef.current?.focus();
        const imageHtml = `<img src="${url.replace(/"/g, '&quot;')}" alt="" style="max-width:240px;height:auto;display:block;margin-top:8px;" />`;
        document.execCommand('insertHTML', false, imageHtml);
        syncEditor();
        setImageUrl('');
        setShowImageInput(false);
        return true;
    };

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-white" onClick={() => applyCommand('bold')} aria-label="Bold">
                        <Bold className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-white" onClick={() => applyCommand('italic')} aria-label="Italic">
                        <Italic className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-white" onClick={() => applyCommand('insertUnorderedList')} aria-label="Bullet list">
                        <List className="h-4 w-4" />
                    </button>
                    {allowImages && (
                        <button
                            type="button"
                            className={`rounded-lg p-1.5 hover:bg-white ${showImageInput ? 'bg-white text-blue-600' : 'text-slate-600'}`}
                            onClick={() => setShowImageInput((current) => !current)}
                            aria-label="Insert image from URL"
                        >
                            <Image className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
            {allowImages && showImageInput && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <input
                        type="url"
                        value={imageUrl}
                        onChange={(event) => setImageUrl(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                insertImage();
                            }
                        }}
                        placeholder="https://example.com/logo.png"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <IconButton
                        label="Insert image"
                        size="sm"
                        disabled={!isValidImageUrl(imageUrl)}
                        onClick={insertImage}
                        className="text-emerald-600 hover:bg-emerald-50"
                    >
                        <Check className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                        label="Cancel"
                        size="sm"
                        onClick={() => {
                            setImageUrl('');
                            setShowImageInput(false);
                        }}
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>
            )}
            <div
                ref={editorRef}
                contentEditable
                className="min-h-40 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 [&_img]:my-2 [&_img]:block [&_img]:max-h-32 [&_img]:max-w-full [&_img]:rounded-md"
                onInput={syncEditor}
                role="textbox"
                aria-multiline="true"
                data-placeholder={placeholder}
            />
        </div>
    );
};

const SettingsDialog = ({ open, isSuperuser, onClose }) => {
    const [activeTab, setActiveTab] = useState('signature');
    const [general, setGeneral] = useState(emptyGeneral);
    const [selectedEmail, setSelectedEmail] = useState(DEFAULT_EMAIL);
    const [newEmail, setNewEmail] = useState('');
    const [showAddEmail, setShowAddEmail] = useState(false);
    const [ai, setAi] = useState(emptyAi);
    const [tts, setTts] = useState(emptyTts);
    const [providers, setProviders] = useState(AI_PROVIDER_OPTIONS);
    const [models, setModels] = useState([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

    const getSettingsService = useApi(API_URLS.getSettings);
    const updateGeneralService = useApi(API_URLS.updateGeneralSettings);
    const updateAiService = useApi(API_URLS.updateAiSettings);
    const updateTtsService = useApi(API_URLS.updateTtsSettings);
    const fetchModelsService = useApi(API_URLS.fetchAiModels);

    useEffect(() => {
        if (!open) {
            return;
        }
        getSettingsService.call().then((result) => {
            if (result.error) {
                setToast({ open: true, message: result.error, severity: 'error' });
                return;
            }
            const nextGeneral = normalizeGeneral(result.data?.general || {});
            setGeneral(nextGeneral);
            setSelectedEmail(nextGeneral.selected_email || nextGeneral.signatures[0]?.email || DEFAULT_EMAIL);
            const mergedProviders = mergeProviderOptions(result.data?.providers);
            setProviders(mergedProviders);
            setAi(normalizeAiProvider(result.data?.ai, mergedProviders));
            setTts({ ...emptyTts, ...(result.data?.tts || {}) });
            setModels(result.data?.ai?.model ? [{ id: result.data.ai.model, name: result.data.ai.model }] : []);
            setModelsLoaded(Boolean(result.data?.ai?.model));
            setNewEmail('');
            setShowAddEmail(false);
            setActiveTab('signature');
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const providerOptions = useMemo(() => Object.entries(providers), [providers]);
    const currentProviderKey = ai.api_keys?.[ai.provider] || '';
    const currentSignature = general.signatures.find((entry) => entry.email === selectedEmail) || general.signatures[0] || emptySignature();
    const currentAutoresponder = general.autoresponders.find((entry) => entry.email === selectedEmail) || general.autoresponders[0] || emptyAutoresponder();
    const emailOptions = useMemo(() => {
        const emails = new Set([
            ...general.signatures.map((entry) => entry.email),
            ...general.autoresponders.map((entry) => entry.email)
        ]);
        return [...emails].filter(Boolean);
    }, [general.autoresponders, general.signatures]);

    const canRemoveSelectedEmail = emailOptions.length > 1
        && normalizeEmail(selectedEmail) !== DEFAULT_EMAIL;

    const buildGeneralPayload = (overrides = {}) => {
        const payload = {
            ...general,
            ...overrides,
            selected_email: selectedEmail,
            email: selectedEmail
        };
        const selectedSignature = payload.signatures.find((entry) => entry.email === selectedEmail) || payload.signatures[0] || emptySignature(selectedEmail);
        const selectedAutoresponder = payload.autoresponders.find((entry) => entry.email === selectedEmail) || payload.autoresponders[0] || emptyAutoresponder(selectedEmail);
        return {
            ...payload,
            signature_html: selectedSignature.signature_html || '',
            autoresponder_enabled: Boolean(selectedAutoresponder.enabled),
            autoresponder_html: selectedAutoresponder.html || '',
            autoresponder_subject: 'Re: {{subject}}'
        };
    };

    const updateSignature = (value) => {
        setGeneral((current) => ({
            ...current,
            signatures: uniqueEntriesByEmail(
                current.signatures.map((entry) => (
                    entry.email === selectedEmail ? { ...entry, signature_html: value } : entry
                )),
                emptySignature
            )
        }));
    };

    const updateAutoresponder = (updates) => {
        setGeneral((current) => ({
            ...current,
            autoresponders: uniqueEntriesByEmail(
                current.autoresponders.map((entry) => (
                    entry.email === selectedEmail ? { ...entry, ...updates } : entry
                )),
                emptyAutoresponder
            )
        }));
    };

    const addEmail = () => {
        const email = normalizeEmail(newEmail);
        if (!email) {
            setToast({ open: true, message: 'Enter an email address', severity: 'error' });
            return;
        }
        if (emailOptions.includes(email)) {
            setToast({ open: true, message: 'That email is already in the list', severity: 'error' });
            return;
        }
        setGeneral((current) => ({
            ...current,
            signatures: uniqueEntriesByEmail([...current.signatures, emptySignature(email)], emptySignature),
            autoresponders: uniqueEntriesByEmail([...current.autoresponders, emptyAutoresponder(email)], emptyAutoresponder)
        }));
        setSelectedEmail(email);
        setNewEmail('');
        setShowAddEmail(false);
    };

    const removeEmail = () => {
        if (!canRemoveSelectedEmail) {
            if (normalizeEmail(selectedEmail) === DEFAULT_EMAIL) {
                setToast({ open: true, message: `${DEFAULT_EMAIL} cannot be removed`, severity: 'error' });
            }
            return;
        }
        const nextEmails = emailOptions.filter((email) => email !== selectedEmail);
        const nextSelected = nextEmails[0] || DEFAULT_EMAIL;
        setGeneral((current) => ({
            ...current,
            signatures: current.signatures.filter((entry) => entry.email !== selectedEmail),
            autoresponders: current.autoresponders.filter((entry) => entry.email !== selectedEmail)
        }));
        setSelectedEmail(nextSelected);
    };

    const saveGeneral = async (message) => {
        const payload = buildGeneralPayload();
        const result = await updateGeneralService.call(payload);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return null;
        }
        const nextGeneral = normalizeGeneral(result.data?.general || payload);
        setGeneral(nextGeneral);
        setSelectedEmail(nextGeneral.selected_email || selectedEmail);
        setToast({ open: true, message, severity: 'success' });
        return nextGeneral;
    };

    const loadModels = async (payload) => {
        const result = await fetchModelsService.call(payload);
        if (result.error) {
            setModels([]);
            setModelsLoaded(false);
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        setModels(result.data?.models || []);
        setModelsLoaded(true);
        setToast({ open: true, message: `${result.data?.models?.length || 0} models loaded`, severity: 'success' });
    };

    const saveAiKey = async () => {
        const providerKey = String(currentProviderKey || '').trim();
        const payload = {
            ...ai,
            api_key: providerKey,
            api_keys: {
                ...(ai.api_keys || {}),
                [ai.provider]: providerKey
            },
            enabled: Boolean(providerKey),
            model: ''
        };
        const result = await updateAiService.call(payload);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        const nextAi = normalizeAiProvider(result.data?.ai || payload, providers);
        setAi(nextAi);
        setModels([]);
        setModelsLoaded(false);
        await loadModels(nextAi);
        window.dispatchEvent(new Event('mailshot:settings-updated'));
    };

    const saveModel = async (model) => {
        const payload = { ...ai, api_key: currentProviderKey, model };
        setAi(payload);
        const result = await updateAiService.call(payload, '', { silent: true });
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        window.dispatchEvent(new Event('mailshot:settings-updated'));
        setToast({ open: true, message: 'AI model saved', severity: 'success' });
    };

    const saveTts = async () => {
        const result = await updateTtsService.call(tts);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        setTts({ ...emptyTts, ...(result.data?.tts || tts) });
        window.dispatchEvent(new Event('mailshot:settings-updated'));
        setToast({ open: true, message: 'TTS voice saved', severity: 'success' });
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Settings"
            closeOnOverlayClick={false}
            maxWidthClassName="max-w-3xl"
        >
            <div className="w-[min(46rem,calc(100vw-3rem))] max-w-full">
                <div className="sticky top-0 z-10 mb-4 flex gap-2 border-b border-slate-100 bg-white">
                    <button
                        type="button"
                        className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'signature' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                        onClick={() => setActiveTab('signature')}
                    >
                        Signature
                    </button>
                    <button
                        type="button"
                        className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'autoresponder' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                        onClick={() => setActiveTab('autoresponder')}
                    >
                        Auto Responder
                    </button>
                    {isSuperuser && (
                        <>
                            <button
                                type="button"
                                className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'ai' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                                onClick={() => setActiveTab('ai')}
                            >
                                AI
                            </button>
                            <button
                                type="button"
                                className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'tts' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                                onClick={() => setActiveTab('tts')}
                            >
                                TTS
                            </button>
                        </>
                    )}
                </div>

                {(activeTab === 'signature' || activeTab === 'autoresponder') && (
                    <div className="mb-5 space-y-2">
                        <span className="block text-sm font-medium text-slate-700">Email address</span>
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedEmail}
                                onChange={(event) => setSelectedEmail(event.target.value)}
                                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                                {emailOptions.map((email) => (
                                    <option key={email} value={email}>{email}</option>
                                ))}
                            </select>
                            <IconButton
                                label={canRemoveSelectedEmail ? `Remove ${selectedEmail}` : 'Cannot remove this email'}
                                size="sm"
                                disabled={!canRemoveSelectedEmail}
                                onClick={removeEmail}
                                className="shrink-0 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            >
                                <Trash2 className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                                label="Add email address"
                                size="sm"
                                onClick={() => setShowAddEmail((current) => !current)}
                                className={`shrink-0 ${showAddEmail ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}
                            >
                                <Plus className="h-4 w-4" />
                            </IconButton>
                        </div>
                        {showAddEmail && (
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(event) => setNewEmail(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            addEmail();
                                        }
                                    }}
                                    placeholder="name@example.com"
                                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                                <IconButton
                                    label="Confirm add email"
                                    size="sm"
                                    onClick={addEmail}
                                    className="text-emerald-600 hover:bg-emerald-50"
                                >
                                    <Check className="h-4 w-4" />
                                </IconButton>
                                <IconButton
                                    label="Cancel"
                                    size="sm"
                                    onClick={() => {
                                        setNewEmail('');
                                        setShowAddEmail(false);
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </IconButton>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'signature' && (
                    <div className="space-y-4">
                        <RichTextEditor
                            label="Signature"
                            value={currentSignature.signature_html}
                            onChange={updateSignature}
                            allowImages
                        />
                        <Button onClick={() => saveGeneral('Signature saved')} disabled={updateGeneralService.isLoading}>
                            <Save className="h-4 w-4" />
                            Save signature
                        </Button>
                    </div>
                )}

                {activeTab === 'autoresponder' && (
                    <div className="space-y-4">
                        <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                            <input
                                type="checkbox"
                                checked={Boolean(currentAutoresponder.enabled)}
                                onChange={(event) => updateAutoresponder({ enabled: event.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Enable auto responder for this email
                        </label>
                        <RichTextEditor
                            label="Auto responder message"
                            value={currentAutoresponder.html}
                            onChange={(value) => updateAutoresponder({ html: value })}
                            placeholder="Write your auto responder message here…"
                        />
                        <Button onClick={() => saveGeneral('Auto responder saved')} disabled={updateGeneralService.isLoading}>
                            <Save className="h-4 w-4" />
                            Save auto responder
                        </Button>
                    </div>
                )}

                {activeTab === 'ai' && isSuperuser && (
                    <div className="space-y-4">
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Provider</span>
                            <select
                                value={ai.provider}
                                onChange={(event) => {
                                    const provider = event.target.value;
                                    setAi({
                                        ...ai,
                                        provider,
                                        api_key: ai.api_keys?.[provider] || '',
                                        model: ''
                                    });
                                    setModels([]);
                                    setModelsLoaded(false);
                                }}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                                {providerOptions.map(([key, provider]) => (
                                    <option key={key} value={key}>{provider.label}</option>
                                ))}
                            </select>
                        </label>
                        {ai.provider === 'nvidia' && (
                            <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                                NVIDIA is free and fast for read summaries and background speech. Get a key at
                                {' '}
                                <a href="https://build.nvidia.com/models" target="_blank" rel="noopener noreferrer" className="font-semibold underline">build.nvidia.com</a>.
                            </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                            <Input
                                label="API key"
                                placeholder={ai.provider === 'nvidia' ? 'nvapi-...' : 'API key'}
                                value={currentProviderKey}
                                onChange={(event) => {
                                    setAi({
                                        ...ai,
                                        api_key: event.target.value,
                                        api_keys: {
                                            ...(ai.api_keys || {}),
                                            [ai.provider]: event.target.value
                                        },
                                        model: ''
                                    });
                                    setModels([]);
                                    setModelsLoaded(false);
                                }}
                            />
                            <Button onClick={saveAiKey} disabled={!currentProviderKey?.trim() || updateAiService.isLoading || fetchModelsService.isLoading}>
                                <Save className="h-4 w-4" />
                                Save key
                            </Button>
                        </div>
                        {(modelsLoaded || ai.model) && (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium text-slate-700">Model</span>
                                <select
                                    value={ai.model}
                                    onChange={(event) => saveModel(event.target.value)}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="">Select a model</option>
                                    {models.map((model) => (
                                        <option key={model.id} value={model.id}>{model.name || model.id}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                )}

                {activeTab === 'tts' && isSuperuser && (
                    <div className="space-y-4">
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Voice</span>
                            <select
                                value={tts.voice}
                                onChange={(event) => setTts({ ...tts, voice: event.target.value })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                                {KOKORO_VOICES.map((voice) => (
                                    <option key={voice.id} value={voice.id}>{voice.label}</option>
                                ))}
                            </select>
                        </label>
                        <Button onClick={saveTts} disabled={updateTtsService.isLoading}>
                            <Save className="h-4 w-4" />
                            Save voice
                        </Button>
                    </div>
                )}
            </div>
            <Toast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast({ ...toast, open: false })}
            />
        </Dialog>
    );
};

export default SettingsDialog;
