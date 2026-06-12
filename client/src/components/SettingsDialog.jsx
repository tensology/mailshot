import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, List, Plus, Save, Trash2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import Dialog, { DialogActions, DialogButton } from './ui/Dialog';
import Button from './ui/Button';
import Input from './ui/Input';
import Toast from './ui/Toast';

const DEFAULT_EMAIL = 'paul@tensology.com';

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

const emptyAi = {
    enabled: false,
    provider: 'openai',
    api_key: '',
    model: ''
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

const RichTextEditor = ({ label, value, onChange }) => {
    const editorRef = useRef(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const applyCommand = (command) => {
        editorRef.current?.focus();
        document.execCommand(command, false, null);
        onChange(editorRef.current?.innerHTML || '');
    };

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => applyCommand('bold')} aria-label="Bold">
                        <Bold className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => applyCommand('italic')} aria-label="Italic">
                        <Italic className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => applyCommand('insertUnorderedList')} aria-label="Bullet list">
                        <List className="h-4 w-4" />
                    </button>
                </div>
            </div>
            <div
                ref={editorRef}
                contentEditable
                className="min-h-32 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onInput={() => onChange(editorRef.current?.innerHTML || '')}
                role="textbox"
                aria-multiline="true"
            />
        </div>
    );
};

const SettingsDialog = ({ open, isSuperuser, onClose }) => {
    const [activeTab, setActiveTab] = useState('signature');
    const [general, setGeneral] = useState(emptyGeneral);
    const [selectedEmail, setSelectedEmail] = useState(DEFAULT_EMAIL);
    const [newEmail, setNewEmail] = useState('');
    const [ai, setAi] = useState(emptyAi);
    const [providers, setProviders] = useState({});
    const [models, setModels] = useState([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

    const getSettingsService = useApi(API_URLS.getSettings);
    const updateGeneralService = useApi(API_URLS.updateGeneralSettings);
    const updateAiService = useApi(API_URLS.updateAiSettings);
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
            setAi({ ...emptyAi, ...(result.data?.ai || {}) });
            setProviders(result.data?.providers || {});
            setModels(result.data?.ai?.model ? [{ id: result.data.ai.model, name: result.data.ai.model }] : []);
            setModelsLoaded(Boolean(result.data?.ai?.model));
            setNewEmail('');
            setActiveTab('signature');
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const providerOptions = useMemo(() => Object.entries(providers), [providers]);
    const currentSignature = general.signatures.find((entry) => entry.email === selectedEmail) || general.signatures[0] || emptySignature();
    const currentAutoresponder = general.autoresponders.find((entry) => entry.email === selectedEmail) || general.autoresponders[0] || emptyAutoresponder();
    const emailOptions = useMemo(() => {
        const emails = new Set([
            ...general.signatures.map((entry) => entry.email),
            ...general.autoresponders.map((entry) => entry.email)
        ]);
        return [...emails].filter(Boolean);
    }, [general.autoresponders, general.signatures]);

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
            autoresponder_subject: selectedAutoresponder.subject || 'Re: {{subject}}'
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
        setGeneral((current) => ({
            ...current,
            signatures: uniqueEntriesByEmail([...current.signatures, emptySignature(email)], emptySignature),
            autoresponders: uniqueEntriesByEmail([...current.autoresponders, emptyAutoresponder(email)], emptyAutoresponder)
        }));
        setSelectedEmail(email);
        setNewEmail('');
    };

    const removeEmail = () => {
        if (emailOptions.length <= 1) {
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
        const payload = {
            ...ai,
            enabled: Boolean(ai.api_key?.trim()),
            model: ''
        };
        const result = await updateAiService.call(payload);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        const nextAi = { ...emptyAi, ...(result.data?.ai || payload) };
        setAi(nextAi);
        setModels([]);
        setModelsLoaded(false);
        await loadModels(nextAi);
        window.dispatchEvent(new Event('mailshot:settings-updated'));
    };

    const saveModel = async (model) => {
        const payload = { ...ai, model };
        setAi(payload);
        const result = await updateAiService.call(payload, '', { silent: true });
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        window.dispatchEvent(new Event('mailshot:settings-updated'));
        setToast({ open: true, message: 'AI model saved', severity: 'success' });
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Settings"
            footer={(
                <DialogActions>
                    <DialogButton variant="secondary" onClick={onClose}>Close</DialogButton>
                </DialogActions>
            )}
        >
            <div className="min-h-[24rem] w-[min(42rem,calc(100vw-3rem))] max-w-full sm:min-h-[32rem]">
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
                        <button
                            type="button"
                            className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'ai' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                            onClick={() => setActiveTab('ai')}
                        >
                            AI
                        </button>
                    )}
                </div>

                {(activeTab === 'signature' || activeTab === 'autoresponder') && (
                    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email address</span>
                            <select
                                value={selectedEmail}
                                onChange={(event) => setSelectedEmail(event.target.value)}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                                {emailOptions.map((email) => (
                                    <option key={email} value={email}>{email}</option>
                                ))}
                            </select>
                        </label>
                        <div className="flex items-end gap-2">
                            <Input
                                label="Add email"
                                value={newEmail}
                                onChange={(event) => setNewEmail(event.target.value)}
                                placeholder="name@example.com"
                            />
                            <Button onClick={addEmail} variant="secondary" className="shrink-0">
                                <Plus className="h-4 w-4" />
                                Add
                            </Button>
                            <Button onClick={removeEmail} variant="ghost" disabled={emailOptions.length <= 1} className="shrink-0">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {activeTab === 'signature' && (
                    <div className="space-y-4">
                        <RichTextEditor
                            label="Signature"
                            value={currentSignature.signature_html}
                            onChange={updateSignature}
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
                        <Input
                            label="Auto responder subject"
                            value={currentAutoresponder.subject}
                            onChange={(event) => updateAutoresponder({ subject: event.target.value })}
                        />
                        <RichTextEditor
                            label="Auto responder message"
                            value={currentAutoresponder.html}
                            onChange={(value) => updateAutoresponder({ html: value })}
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
                                    setAi({
                                        ...ai,
                                        provider: event.target.value,
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
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                            <Input
                                label="API key"
                                value={ai.api_key}
                                onChange={(event) => {
                                    setAi({ ...ai, api_key: event.target.value, model: '' });
                                    setModels([]);
                                    setModelsLoaded(false);
                                }}
                            />
                            <Button onClick={saveAiKey} disabled={!ai.api_key?.trim() || updateAiService.isLoading || fetchModelsService.isLoading}>
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
