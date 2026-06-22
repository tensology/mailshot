import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Minus, Paperclip, Send, X } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { MAIL_FROM, MAILBOX_USER } from '../config/env';
import { useCompose } from '../context/ComposeContext';
import { useLayout } from '../context/LayoutContext';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
import Textarea from './ui/Textarea';
import Toast from './ui/Toast';

const getWindowClass = (composeState, isMobile) => {
    if (composeState === 'minimized') {
        return 'h-12 w-[min(18rem,88vw)]';
    }

    if (composeState === 'expanded') {
        return isMobile
            ? 'inset-3 h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)]'
            : 'h-[min(720px,calc(100dvh-3rem))] w-[min(960px,calc(100vw-3rem))]';
    }

    return isMobile
        ? 'inset-x-3 bottom-3 h-[min(560px,calc(100dvh-5rem))] w-[calc(100vw-1.5rem)]'
        : 'h-[560px] w-[560px]';
};

const htmlToPlainText = (html = '') => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return (container.innerText || container.textContent || '').trim();
};

const normalizeSignatureOptions = (general = {}) => {
    const entries = Array.isArray(general.signatures) ? general.signatures : [];
    const fallbackEmail = general.selected_email || general.email || MAIL_FROM || 'you@example.com';
    const source = entries.length
        ? entries
        : [{ email: fallbackEmail, signature_html: general.signature_html || '' }];

    return source
        .map((entry) => ({
            email: String(entry.email || '').trim().toLowerCase(),
            signature: htmlToPlainText(entry.signature_html || '')
        }))
        .filter((entry) => entry.email && entry.signature);
};

const removeTrailingSignature = (body = '', signature = '') => {
    if (!signature) {
        return body;
    }

    const normalizedBody = String(body || '').replace(/\s+$/g, '');
    const normalizedSignature = String(signature || '').trim();
    if (!normalizedSignature || !normalizedBody.endsWith(normalizedSignature)) {
        return body;
    }

    return normalizedBody.slice(0, normalizedBody.length - normalizedSignature.length).replace(/\s+$/g, '');
};

const applySignatureToBody = (body = '', nextSignature = '', previousSignature = '') => {
    const withoutPrevious = removeTrailingSignature(body, previousSignature);
    if (!nextSignature) {
        return withoutPrevious;
    }
    if (removeTrailingSignature(withoutPrevious, nextSignature) !== withoutPrevious) {
        return withoutPrevious;
    }
    return `${withoutPrevious}${withoutPrevious ? '\n\n' : ''}${nextSignature}`;
};

const hasDraftContent = (draft = {}) => (
    ['to', 'cc', 'bcc', 'subject', 'body'].some((field) => String(draft[field] || '').trim())
);

const ComposeMail = ({ onSent }) => {
    const { isOpen, composeState, draft, closeCompose, setComposeState } = useCompose();
    const { isMobile } = useLayout();
    const [data, setData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '' });
    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const sendEmailService = useApi(API_URLS.sendEmail);
    const saveDraftService = useApi(API_URLS.saveDraftEmails);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const getContactsService = useApi(API_URLS.getContacts);
    const getSettingsService = useApi(API_URLS.getSettings);
    const [contactOptions, setContactOptions] = useState([]);
    const [signatureOptions, setSignatureOptions] = useState([]);
    const [selectedSignatureEmail, setSelectedSignatureEmail] = useState('');
    const bodyRef = useRef(null);
    const draftIdRef = useRef('');
    const hasUserEditedRef = useRef(false);
    const lastSavedDraftRef = useRef('');
    const appliedSignatureRef = useRef('');

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        let cancelled = false;

        const loadComposeState = async () => {
            let signatures = [];
            const settingsResult = await getSettingsService.call({}, '', { silent: true });
            if (!settingsResult.error) {
                signatures = normalizeSignatureOptions(settingsResult.data?.general || {});
            }

            const baseBody = draft.body || '';
            const selectedSignature = signatures.find((entry) => baseBody.trim().endsWith(entry.signature))
                || signatures[0]
                || { email: '', signature: '' };
            const shouldApplySignature = selectedSignature.signature && !draft.in_reply_to;
            if (!cancelled) {
                appliedSignatureRef.current = shouldApplySignature ? selectedSignature.signature : '';
                setSignatureOptions(signatures);
                setSelectedSignatureEmail(selectedSignature.email || '');
                setData({
                    to: draft.to || '',
                    cc: draft.cc || '',
                    bcc: draft.bcc || '',
                    subject: draft.subject || '',
                    body: shouldApplySignature
                        ? applySignatureToBody(baseBody, selectedSignature.signature)
                        : baseBody
                });
            }
        };

        loadComposeState();
        draftIdRef.current = draft._id || draft.id || '';
        hasUserEditedRef.current = false;
        lastSavedDraftRef.current = '';
        setShowCc(Boolean(draft.show_cc || draft.cc));
        setShowBcc(Boolean(draft.show_bcc || draft.bcc));
        setAttachments([]);
        setSignatureOptions([]);
        setSelectedSignatureEmail('');
        appliedSignatureRef.current = '';

        getContactsService.call().then((result) => {
            if (!result.error && Array.isArray(result.data)) {
                setContactOptions(result.data);
            }
        });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, draft]);

    useEffect(() => {
        if (!isOpen || composeState === 'minimized' || !bodyRef.current) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            if (!bodyRef.current) {
                return;
            }

            bodyRef.current.focus();
            if (draft.in_reply_to) {
                bodyRef.current.setSelectionRange(0, 0);
            }
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [composeState, draft.in_reply_to, isOpen]);

    const onValueChange = (event) => {
        hasUserEditedRef.current = true;
        setData({ ...data, [event.target.name]: event.target.value });
    };

    const onAttachmentChange = (event) => {
        hasUserEditedRef.current = true;
        setAttachments(Array.from(event.target.files || []));
    };

    const resetForm = () => {
        setData({ to: '', cc: '', bcc: '', subject: '', body: '' });
        setShowCc(false);
        setShowBcc(false);
        setAttachments([]);
        draftIdRef.current = '';
        hasUserEditedRef.current = false;
        lastSavedDraftRef.current = '';
        appliedSignatureRef.current = '';
    };

    const changeSignature = (email) => {
        const nextSignature = signatureOptions.find((entry) => entry.email === email)?.signature || '';
        const previousSignature = appliedSignatureRef.current;
        hasUserEditedRef.current = true;
        appliedSignatureRef.current = nextSignature;
        setSelectedSignatureEmail(email);
        setData((current) => ({
            ...current,
            body: applySignatureToBody(current.body, nextSignature, previousSignature)
        }));
    };

    const saveDraft = useCallback(async ({ silent = true } = {}) => {
        const draftPayload = {
            ...(draftIdRef.current ? { _id: draftIdRef.current } : {}),
            to: data.to,
            cc: data.cc,
            bcc: data.bcc,
            from: MAIL_FROM,
            subject: data.subject,
            body: data.body,
            date: new Date(),
            image: '',
            name: MAILBOX_USER,
            starred: false,
            type: 'drafts',
            in_reply_to: draft.in_reply_to || '',
            references: Array.isArray(draft.references) ? draft.references : []
        };

        if (!hasDraftContent(draftPayload) || (!draftIdRef.current && !hasUserEditedRef.current)) {
            return { skipped: true, error: '' };
        }

        const draftSignature = JSON.stringify({
            id: draftIdRef.current,
            to: draftPayload.to,
            cc: draftPayload.cc,
            bcc: draftPayload.bcc,
            subject: draftPayload.subject,
            body: draftPayload.body
        });

        if (silent && draftSignature === lastSavedDraftRef.current) {
            return { skipped: true, error: '' };
        }

        const result = await saveDraftService.call(draftPayload, '', { silent });
        if (result.error) {
            return result;
        }

        if (result.data?._id) {
            draftIdRef.current = result.data._id;
        }
        window.dispatchEvent(new CustomEvent('mailshot:draft-saved', { detail: { draft: result.data } }));
        lastSavedDraftRef.current = JSON.stringify({
            id: draftIdRef.current,
            to: draftPayload.to,
            cc: draftPayload.cc,
            bcc: draftPayload.bcc,
            subject: draftPayload.subject,
            body: draftPayload.body
        });
        return result;
    }, [data, draft.in_reply_to, draft.references, saveDraftService]);

    useEffect(() => {
        if (!isOpen || !hasUserEditedRef.current || !hasDraftContent(data)) {
            return undefined;
        }

        const saveTimer = window.setTimeout(() => {
            saveDraft({ silent: true });
        }, 1200);

        return () => window.clearTimeout(saveTimer);
    }, [data, isOpen, saveDraft]);

    const sendEmail = async (event) => {
        event.preventDefault();

        if (!data.to?.trim()) {
            setSnackbar({ open: true, message: 'Recipient is required', severity: 'error' });
            return;
        }

        if (!data.subject?.trim()) {
            setSnackbar({ open: true, message: 'Subject is required', severity: 'error' });
            return;
        }

        const payload = new FormData();
        payload.append('to', data.to);
        if (data.cc?.trim()) {
            payload.append('cc', data.cc);
        }
        if (data.bcc?.trim()) {
            payload.append('bcc', data.bcc);
        }
        payload.append('subject', data.subject);
        payload.append('body', data.body || '');
        if (draft.in_reply_to) {
            payload.append('inReplyTo', draft.in_reply_to);
        }
        if (draft.references?.length) {
            payload.append('references', draft.references.join(','));
        }
        attachments.forEach((file) => payload.append('attachments', file));

        const result = await sendEmailService.call(payload);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        if (draftIdRef.current) {
            await deleteEmailsService.call([draftIdRef.current], '', { silent: true });
            window.dispatchEvent(new CustomEvent('mailshot:draft-saved'));
        }

        setSnackbar({ open: true, message: 'Message sent', severity: 'success' });
        closeCompose();
        resetForm();
        if (onSent) {
            onSent();
        }
    };

    const saveDraftAndClose = async () => {
        if (!hasDraftContent(data) || (!draftIdRef.current && !hasUserEditedRef.current)) {
            closeCompose();
            resetForm();
            return;
        }

        const result = await saveDraft({ silent: false });
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        closeCompose();
        resetForm();
    };

    if (!isOpen) {
        return null;
    }

    const isMinimized = composeState === 'minimized';
    const windowClass = getWindowClass(composeState, isMobile);

    const composeWindow = (
        <div
            className={`fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all ${
                composeState === 'expanded' && isMobile ? 'left-0 top-0' : 'right-3 bottom-0 sm:right-6'
            } ${windowClass}`}
        >
            <div
                className="flex min-h-11 items-center justify-between bg-slate-800 px-3 text-white"
                onClick={isMinimized ? () => setComposeState('normal') : undefined}
                onKeyDown={undefined}
                role="presentation"
            >
                <p className="truncate text-sm font-medium">{draft.title || 'New Message'}</p>
                <div className="flex items-center">
                    {!isMinimized && (
                        <IconButton
                            label={composeState === 'expanded' ? 'Restore' : 'Expand'}
                            size="sm"
                            className="text-white hover:bg-white/10"
                            onClick={() => setComposeState(composeState === 'expanded' ? 'normal' : 'expanded')}
                        >
                            {composeState === 'expanded' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </IconButton>
                    )}
                    <IconButton
                        label="Minimize"
                        size="sm"
                        className="text-white hover:bg-white/10"
                        onClick={(event) => {
                            event.stopPropagation();
                            setComposeState(isMinimized ? 'normal' : 'minimized');
                        }}
                    >
                        <Minus className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                        label="Close"
                        size="sm"
                        className="text-white hover:bg-white/10"
                        onClick={(event) => {
                            event.stopPropagation();
                            saveDraftAndClose();
                        }}
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>

            {!isMinimized && (
                <form onSubmit={sendEmail} className="flex min-h-0 flex-1 flex-col">
                    <div className="space-y-0 border-b border-slate-100">
                        <div className="flex items-center gap-2 px-3 py-2">
                            <span className="w-8 text-xs text-slate-500">To</span>
                            <input
                                name="to"
                                list="compose-contact-suggestions"
                                value={data.to}
                                onChange={onValueChange}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                            <div className="flex gap-1 text-xs text-slate-500">
                                {!showCc && (
                                    <button type="button" onClick={() => setShowCc(true)}>Cc</button>
                                )}
                                {!showBcc && (
                                    <button type="button" onClick={() => setShowBcc(true)}>Bcc</button>
                                )}
                            </div>
                        </div>
                        {showCc && (
                            <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                                <span className="w-8 text-xs text-slate-500">Cc</span>
                                <input name="cc" value={data.cc} onChange={onValueChange} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                            </div>
                        )}
                        {showBcc && (
                            <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                                <span className="w-8 text-xs text-slate-500">Bcc</span>
                                <input name="bcc" value={data.bcc} onChange={onValueChange} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                            </div>
                        )}
                        <div className="border-t border-slate-100 px-3 py-2">
                            <input
                                name="subject"
                                placeholder="Subject"
                                value={data.subject}
                                onChange={onValueChange}
                                className="w-full bg-transparent text-sm outline-none"
                            />
                        </div>
                    </div>

                    <datalist id="compose-contact-suggestions">
                        {contactOptions.map((contact) => (
                            <option key={contact._id} value={contact.email}>{contact.name}</option>
                        ))}
                    </datalist>

                    <Textarea
                        ref={bodyRef}
                        name="body"
                        rows={composeState === 'expanded' ? 16 : 10}
                        value={data.body}
                        onChange={onValueChange}
                        placeholder="Write your message"
                        className="min-h-0 flex-1 border-0 px-3 py-3 focus:ring-0 [&_textarea]:min-h-[180px] [&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:shadow-none [&_textarea]:focus:ring-0"
                    />

                    {attachments.length > 0 && (
                        <p className="px-3 text-xs text-slate-500">{attachments.length} attachment(s) selected</p>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-100 px-3 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Button type="submit" disabled={sendEmailService.isLoading} className="rounded-full">
                                {sendEmailService.isLoading ? <Spinner size={18} className="border-white/30 border-t-white" /> : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        Send
                                    </>
                                )}
                            </Button>
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                                <Paperclip className="h-4 w-4" />
                                Attach
                                <input hidden type="file" multiple onChange={onAttachmentChange} />
                            </label>
                            {signatureOptions.length > 1 && (
                                <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                                    <span>Signature</span>
                                    <select
                                        value={selectedSignatureEmail}
                                        onChange={(event) => changeSignature(event.target.value)}
                                        className="h-8 max-w-[13rem] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    >
                                        {signatureOptions.map((option) => (
                                            <option key={option.email} value={option.email}>{option.email}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>
                    </div>
                </form>
            )}

            <Toast
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            />
        </div>
    );

    return createPortal(composeWindow, document.body);
};

export default ComposeMail;
