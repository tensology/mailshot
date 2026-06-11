import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, List, RefreshCw, Save } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import Dialog, { DialogActions, DialogButton } from './ui/Dialog';
import Button from './ui/Button';
import Input from './ui/Input';
import Toast from './ui/Toast';

const emptyGeneral = {
    email: 'paul@tensology.com',
    signature_html: '',
    autoresponder_enabled: false,
    autoresponder_html: '',
    autoresponder_subject: 'Re: {{subject}}'
};

const emptyAi = {
    enabled: false,
    provider: 'openai',
    api_key: '',
    base_url: '',
    model: ''
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
    const [activeTab, setActiveTab] = useState('general');
    const [general, setGeneral] = useState(emptyGeneral);
    const [ai, setAi] = useState(emptyAi);
    const [providers, setProviders] = useState({});
    const [models, setModels] = useState([]);
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
            setGeneral({ ...emptyGeneral, ...(result.data?.general || {}) });
            setAi({ ...emptyAi, ...(result.data?.ai || {}) });
            setProviders(result.data?.providers || {});
            setModels(result.data?.ai?.model ? [{ id: result.data.ai.model, name: result.data.ai.model }] : []);
            setActiveTab('general');
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const providerOptions = useMemo(() => Object.entries(providers), [providers]);
    const selectedProvider = providers[ai.provider] || {};

    const saveGeneral = async () => {
        const result = await updateGeneralService.call(general);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        setToast({ open: true, message: 'General settings saved', severity: 'success' });
    };

    const saveAi = async () => {
        const result = await updateAiService.call(ai);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        setToast({ open: true, message: 'AI settings saved', severity: 'success' });
    };

    const loadModels = async () => {
        const result = await fetchModelsService.call(ai);
        if (result.error) {
            setToast({ open: true, message: result.error, severity: 'error' });
            return;
        }
        setModels(result.data?.models || []);
        setToast({ open: true, message: `${result.data?.models?.length || 0} models loaded`, severity: 'success' });
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
                        className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'general' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                        onClick={() => setActiveTab('general')}
                    >
                        General
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

                {activeTab === 'general' && (
                    <div className="space-y-4">
                        <Input
                            label="Linked email"
                            value={general.email}
                            onChange={(event) => setGeneral({ ...general, email: event.target.value })}
                        />
                        <RichTextEditor
                            label="Signature"
                            value={general.signature_html}
                            onChange={(value) => setGeneral({ ...general, signature_html: value })}
                        />
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                                <input
                                    type="checkbox"
                                    checked={general.autoresponder_enabled}
                                    onChange={(event) => setGeneral({ ...general, autoresponder_enabled: event.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                Enable auto responder for new inbound mail
                            </label>
                            <div className="mt-4 space-y-4">
                                <Input
                                    label="Auto responder subject"
                                    value={general.autoresponder_subject}
                                    onChange={(event) => setGeneral({ ...general, autoresponder_subject: event.target.value })}
                                />
                                <RichTextEditor
                                    label="Auto responder message"
                                    value={general.autoresponder_html}
                                    onChange={(value) => setGeneral({ ...general, autoresponder_html: value })}
                                />
                            </div>
                        </div>
                        <Button onClick={saveGeneral} disabled={updateGeneralService.isLoading}>
                            <Save className="h-4 w-4" />
                            Save general
                        </Button>
                    </div>
                )}

                {activeTab === 'ai' && isSuperuser && (
                    <div className="space-y-4">
                        <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                            <input
                                type="checkbox"
                                checked={ai.enabled}
                                onChange={(event) => setAi({ ...ai, enabled: event.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Enable AI features for this Mailshot account
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Provider</span>
                            <select
                                value={ai.provider}
                                onChange={(event) => setAi({
                                    ...ai,
                                    provider: event.target.value,
                                    base_url: providers[event.target.value]?.base_url || '',
                                    model: ''
                                })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                                {providerOptions.map(([key, provider]) => (
                                    <option key={key} value={key}>{provider.label}</option>
                                ))}
                            </select>
                        </label>
                        <Input
                            label="Base URL"
                            value={ai.base_url || selectedProvider.base_url || ''}
                            onChange={(event) => setAi({ ...ai, base_url: event.target.value })}
                        />
                        <Input
                            label="API key"
                            value={ai.api_key}
                            onChange={(event) => setAi({ ...ai, api_key: event.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={loadModels} disabled={!ai.api_key || fetchModelsService.isLoading}>
                                <RefreshCw className={`h-4 w-4 ${fetchModelsService.isLoading ? 'animate-spin' : ''}`} />
                                Load models
                            </Button>
                            <Button onClick={saveAi} disabled={updateAiService.isLoading}>
                                <Save className="h-4 w-4" />
                                Save AI
                            </Button>
                        </div>
                        {(models.length > 0 || ai.model) && (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium text-slate-700">Model</span>
                                <select
                                    value={ai.model}
                                    onChange={(event) => setAi({ ...ai, model: event.target.value })}
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
