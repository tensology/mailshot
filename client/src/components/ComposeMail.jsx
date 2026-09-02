import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Download, FileText, Maximize2, Minimize2, Minus, Paperclip, Send, X } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { API_URL, MAIL_FROM, MAILBOX_USER } from '../config/env';
import { useCompose } from '../context/ComposeContext';
import { useLayout } from '../context/LayoutContext';
import {
    applySignatureHtml,
    htmlToPlainText,
    normalizeSignatureOptions
} from '../utils/signatureComposer';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
import Toast from './ui/Toast';
import {
    appendUniqueFiles,
    filesFromAttachmentEvent,
    isFileDropEvent,
    reconcileAttachmentSave,
    resolveCapturedAttachmentIntent
} from '../utils/attachmentEvents';
import { createDraftSaveQueue } from '../utils/draftSaveQueue';

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

const sanitizeComposeHtml = (html = '') => DOMPurify.sanitize(String(html || ''), {
    ADD_ATTR: ['style', 'target', 'rel'],
    ALLOWED_TAGS: [
        'a', 'b', 'br', 'div', 'em', 'i', 'img', 'li', 'ol', 'p', 'span', 'strong', 'u', 'ul'
    ]
});

const plainTextToHtml = (text = '') => String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim() ? `<div>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : '<div><br></div>')
    .join('');

const resolveDraftHtml = (draft = {}) => (
    sanitizeComposeHtml(draft.body_html || draft.html || (draft.body ? plainTextToHtml(draft.body) : ''))
);

const ComposeBodyEditor = forwardRef(({ value, onChange, placeholder = 'Write your message', className = '' }, ref) => {
    const editorRef = useRef(null);

    useImperativeHandle(ref, () => ({
        focus: () => editorRef.current?.focus(),
        setSelectionRange: () => {
            const editor = editorRef.current;
            if (!editor) return;
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }));

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const syncEditor = () => onChange(editorRef.current?.innerHTML || '');

    return (
        <div className={`relative ${className}`}>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={placeholder}
                className="h-full min-h-[180px] overflow-y-auto px-3 py-3 text-sm leading-6 text-slate-900 outline-none [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
                onInput={syncEditor}
                onBlur={syncEditor}
            />
            {!String(value || '').trim() && (
                <span className="pointer-events-none absolute left-3 top-3 text-sm text-slate-400">{placeholder}</span>
            )}
        </div>
    );
});

ComposeBodyEditor.displayName = 'ComposeBodyEditor';

const parseRecipientList = (value = '') => (
    String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
);

const uniqueRecipients = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = String(item || '').trim().toLowerCase();
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const formatFileSize = (size = 0) => {
    const bytes = Number(size) || 0;
    if (!bytes) {
        return '';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const hasDraftContent = (draft = {}) => (
    ['to', 'cc', 'bcc', 'subject', 'body', 'html', 'body_html'].some((field) => String(draft[field] || '').trim())
);

const ComposeWindow = ({ item, index, onSent }) => {
    const { closeCompose, setComposeState } = useCompose();
    const { isMobile } = useLayout();
    const { id: composeId, draft, composeState } = item;
    const [data, setData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', html: '' });
    const [toRecipients, setToRecipients] = useState([]);
    const [toInput, setToInput] = useState('');
    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [savedAttachments, setSavedAttachments] = useState([]);
    const [newAttachments, setNewAttachments] = useState([]);
    const [forwardedAttachments, setForwardedAttachments] = useState([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [sendQueued, setSendQueued] = useState(false);
    const sendEmailService = useApi(API_URLS.sendEmail);
    const saveDraftService = useApi(API_URLS.saveDraftEmails);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const getContactsService = useApi(API_URLS.getContacts);
    const getSettingsService = useApi(API_URLS.getSettings);
    const [contactOptions, setContactOptions] = useState([]);
    const [signatureOptions, setSignatureOptions] = useState([]);
    const [selectedSignatureEmail, setSelectedSignatureEmail] = useState('');
    const [signatureEnabled, setSignatureEnabled] = useState(false);
    const bodyRef = useRef(null);
    const attachmentInputRef = useRef(null);
    const draftIdRef = useRef('');
    const hasUserEditedRef = useRef(false);
    const lastSavedDraftRef = useRef('');
    const appliedSignatureRef = useRef('');
    const savedAttachmentsRef = useRef([]);
    const newAttachmentsRef = useRef([]);
    const saveQueueRef = useRef(null);
    const sendStartedRef = useRef(false);
    if (!saveQueueRef.current) {
        saveQueueRef.current = createDraftSaveQueue();
    }
    const contactListId = `compose-contact-suggestions-${composeId}`;

    const replaceSavedAttachments = useCallback((nextValue) => {
        const next = typeof nextValue === 'function'
            ? nextValue(savedAttachmentsRef.current)
            : nextValue;
        savedAttachmentsRef.current = next;
        setSavedAttachments(next);
    }, []);

    const replaceNewAttachments = useCallback((nextValue) => {
        const next = typeof nextValue === 'function'
            ? nextValue(newAttachmentsRef.current)
            : nextValue;
        newAttachmentsRef.current = next;
        setNewAttachments(next);
    }, []);

    const getToValue = useCallback(() => (
        uniqueRecipients([...toRecipients, toInput.trim()]).join(', ')
    ), [toInput, toRecipients]);

    useEffect(() => {
        let cancelled = false;
        const baseHtml = resolveDraftHtml(draft);

        setData({
            to: '',
            cc: draft.cc || '',
            bcc: draft.bcc || '',
            subject: draft.subject || '',
            body: htmlToPlainText(baseHtml),
            html: baseHtml
        });

        const loadComposeState = async () => {
            let signatures = [];
            const settingsResult = await getSettingsService.call({}, '', { silent: true });
            if (!settingsResult.error) {
                signatures = normalizeSignatureOptions(settingsResult.data?.general || {}, MAIL_FROM || 'paul@tensology.com');
            }

            const selectedSignature = signatures.find((entry) => entry.html && baseHtml.trim().endsWith(entry.html))
                || signatures[0]
                || { email: '', html: '', text: '' };
            const shouldApplySignature = Boolean(selectedSignature.html) && !draft.in_reply_to;
            const nextHtml = shouldApplySignature
                ? applySignatureHtml(baseHtml, selectedSignature.html)
                : baseHtml;
            if (!cancelled) {
                appliedSignatureRef.current = shouldApplySignature ? selectedSignature.html : '';
                setSignatureOptions(signatures);
                setSelectedSignatureEmail(selectedSignature.email || '');
                setSignatureEnabled(shouldApplySignature);
                setToRecipients(parseRecipientList(draft.to));
                setToInput('');
                setData({
                    to: '',
                    cc: draft.cc || '',
                    bcc: draft.bcc || '',
                    subject: draft.subject || '',
                    body: htmlToPlainText(nextHtml),
                    html: nextHtml
                });
            }
        };

        loadComposeState();
        draftIdRef.current = draft._id || draft.id || '';
        hasUserEditedRef.current = false;
        lastSavedDraftRef.current = '';
        setShowCc(Boolean(draft.show_cc || draft.cc));
        setShowBcc(Boolean(draft.show_bcc || draft.bcc));
        replaceSavedAttachments(Array.isArray(draft.attachments) ? draft.attachments : []);
        replaceNewAttachments([]);
        setForwardedAttachments(Array.isArray(draft.forwarded_attachments) ? draft.forwarded_attachments : []);
        setSignatureOptions([]);
        setSelectedSignatureEmail('');
        setSignatureEnabled(false);
        setToRecipients(parseRecipientList(draft.to));
        setToInput('');
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
    }, [composeId, draft, replaceNewAttachments, replaceSavedAttachments]);

    useEffect(() => {
        if (composeState === 'minimized' || !bodyRef.current) {
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
    }, [composeState, draft.in_reply_to]);

    const onValueChange = (event) => {
        hasUserEditedRef.current = true;
        setData({ ...data, [event.target.name]: event.target.value });
    };

    const addAttachments = useCallback((event) => {
        if (event.dataTransfer) {
            if (!isFileDropEvent(event)) {
                return;
            }
            event.preventDefault();
        }
        const files = filesFromAttachmentEvent(event);
        if (!files.length) {
            return;
        }
        hasUserEditedRef.current = true;
        replaceNewAttachments((current) => appendUniqueFiles(current, files, savedAttachmentsRef.current));
        if (event.target?.type === 'file') {
            event.target.value = '';
        }
    }, [replaceNewAttachments]);

    const updateToInput = (event) => {
        const value = event.target.value;
        hasUserEditedRef.current = true;

        if (!value.includes(',')) {
            setToInput(value);
            return;
        }

        const parts = value.split(',');
        const additions = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
        const remainder = parts[parts.length - 1] || '';
        setToRecipients((current) => uniqueRecipients([...current, ...additions]));
        setToInput(remainder.trimStart());
    };

    const finalizeToInput = () => {
        const value = toInput.trim();
        if (!value) {
            return;
        }

        hasUserEditedRef.current = true;
        setToRecipients((current) => uniqueRecipients([...current, value]));
        setToInput('');
    };

    const onToKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
            if (toInput.trim()) {
                event.preventDefault();
                finalizeToInput();
            }
            return;
        }

        if (event.key === 'Backspace' && !toInput) {
            setToRecipients((current) => current.slice(0, -1));
            hasUserEditedRef.current = true;
        }
    };

    const removeToRecipient = (recipient) => {
        hasUserEditedRef.current = true;
        setToRecipients((current) => current.filter((item) => item !== recipient));
    };

    const resetForm = () => {
        setData({ to: '', cc: '', bcc: '', subject: '', body: '', html: '' });
        setToRecipients([]);
        setToInput('');
        setShowCc(false);
        setShowBcc(false);
        replaceSavedAttachments([]);
        replaceNewAttachments([]);
        setForwardedAttachments([]);
        setSignatureOptions([]);
        setSelectedSignatureEmail('');
        setSignatureEnabled(false);
        draftIdRef.current = '';
        hasUserEditedRef.current = false;
        lastSavedDraftRef.current = '';
        appliedSignatureRef.current = '';
    };

    const changeSignature = (email) => {
        const nextSignature = signatureOptions.find((entry) => entry.email === email)?.html || '';
        const previousSignature = appliedSignatureRef.current;
        hasUserEditedRef.current = true;
        appliedSignatureRef.current = nextSignature;
        setSelectedSignatureEmail(email);
        setSignatureEnabled(Boolean(nextSignature || signatureOptions.find((entry) => entry.email === email)?.html));
        setData((current) => ({
            ...current,
            ...(() => {
                const html = applySignatureHtml(current.html, nextSignature, previousSignature);
                return { html, body: htmlToPlainText(html) };
            })()
        }));
    };

    const onBodyHtmlChange = (html) => {
        const sanitized = sanitizeComposeHtml(html);
        hasUserEditedRef.current = true;
        setData((current) => ({ ...current, html: sanitized, body: htmlToPlainText(sanitized) }));
    };

    const saveDraft = useCallback(({ silent = true } = {}) => {
        if (silent && sendStartedRef.current) {
            return Promise.resolve({ cancelled: true });
        }
        const to = getToValue();
        const saveState = {
            to,
            cc: data.cc,
            bcc: data.bcc,
            subject: data.subject,
            body: data.body,
            body_html: data.html,
            in_reply_to: draft.in_reply_to || '',
            references: Array.isArray(draft.references) ? [...draft.references] : [],
            savedAttachments: [...savedAttachmentsRef.current],
            newAttachments: [...newAttachmentsRef.current]
        };

        const hasAnyDraftContent = hasDraftContent({ ...data, to })
            || saveState.savedAttachments.length > 0
            || saveState.newAttachments.length > 0;
        if (!hasAnyDraftContent || (!draftIdRef.current && !hasUserEditedRef.current)) {
            return Promise.resolve({ skipped: true, error: '' });
        }

        return saveQueueRef.current.enqueue(async () => {
            const attachmentState = silent
                ? {
                    saved: [...savedAttachmentsRef.current],
                    pending: [...newAttachmentsRef.current]
                }
                : resolveCapturedAttachmentIntent({
                    currentSaved: savedAttachmentsRef.current,
                    currentPending: newAttachmentsRef.current,
                    capturedSaved: saveState.savedAttachments,
                    capturedPending: saveState.newAttachments
                });
            const draftSnapshot = {
                id: draftIdRef.current,
                to: saveState.to,
                cc: saveState.cc,
                bcc: saveState.bcc,
                subject: saveState.subject,
                body: saveState.body,
                body_html: saveState.body_html,
                retained_attachments: attachmentState.saved.map((attachment) => attachment.attachment_id).filter(Boolean),
                new_attachments: attachmentState.pending.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
            };
            const draftSignature = JSON.stringify(draftSnapshot);
            if (silent && draftSignature === lastSavedDraftRef.current) {
                return { skipped: true, error: '' };
            }

            const draftPayload = new FormData();
            if (draftIdRef.current) {
                draftPayload.append('_id', draftIdRef.current);
            }
            draftPayload.append('to', saveState.to);
            draftPayload.append('cc', saveState.cc);
            draftPayload.append('bcc', saveState.bcc);
            draftPayload.append('from', MAIL_FROM);
            draftPayload.append('subject', saveState.subject);
            draftPayload.append('body', saveState.body);
            draftPayload.append('body_html', saveState.body_html);
            draftPayload.append('date', new Date().toISOString());
            draftPayload.append('image', '');
            draftPayload.append('name', MAILBOX_USER);
            draftPayload.append('starred', 'false');
            draftPayload.append('type', 'drafts');
            draftPayload.append('in_reply_to', saveState.in_reply_to);
            draftPayload.append('references', JSON.stringify(saveState.references));
            draftPayload.append('retained_attachments', JSON.stringify(draftSnapshot.retained_attachments));
            attachmentState.pending.forEach((file) => draftPayload.append('attachments', file));

            const result = await saveDraftService.call(draftPayload, '', { silent });
            if (result.error) {
                return result;
            }

            if (result.data?._id) {
                draftIdRef.current = result.data._id;
            }
            if (Array.isArray(result.data?.attachments)) {
                const reconciled = reconcileAttachmentSave({
                    currentSaved: savedAttachmentsRef.current,
                    currentPending: newAttachmentsRef.current,
                    requestedSaved: attachmentState.saved,
                    requestedPending: attachmentState.pending,
                    returnedSaved: result.data.attachments
                });
                replaceSavedAttachments(reconciled.saved);
                replaceNewAttachments(reconciled.pending);
            }
            window.dispatchEvent(new CustomEvent('mailshot:draft-saved', { detail: { draft: result.data } }));
            lastSavedDraftRef.current = JSON.stringify({ ...draftSnapshot, id: draftIdRef.current, new_attachments: [] });
            return result;
        }, { coalesce: silent });
    }, [data, draft.in_reply_to, draft.references, getToValue, replaceNewAttachments, replaceSavedAttachments, saveDraftService]);

    useEffect(() => {
        const hasAnyDraftContent = hasDraftContent({ ...data, to: getToValue() }) || savedAttachments.length > 0 || newAttachments.length > 0;
        if (sendStartedRef.current || !hasUserEditedRef.current || !hasAnyDraftContent) {
            return undefined;
        }

        const saveTimer = window.setTimeout(() => {
            if (!sendStartedRef.current) {
                saveDraft({ silent: true });
            }
        }, 1200);

        return () => window.clearTimeout(saveTimer);
    }, [data, getToValue, newAttachments, saveDraft, savedAttachments, sendQueued, toInput, toRecipients]);

    const sendEmail = async (event) => {
        event.preventDefault();
        if (sendStartedRef.current) {
            return;
        }
        finalizeToInput();
        const to = uniqueRecipients([...toRecipients, toInput.trim()]).join(', ');

        if (!to) {
            setSnackbar({ open: true, message: 'Recipient is required', severity: 'error' });
            return;
        }

        if (!data.subject?.trim()) {
            setSnackbar({ open: true, message: 'Subject is required', severity: 'error' });
            return;
        }

        const sendState = {
            to,
            cc: data.cc,
            bcc: data.bcc,
            subject: data.subject,
            body: data.body || '',
            html: data.html || '',
            inReplyTo: draft.in_reply_to || '',
            references: Array.isArray(draft.references) ? [...draft.references] : []
        };
        sendStartedRef.current = true;
        setSendQueued(true);

        let result;
        try {
            result = await saveQueueRef.current.enqueueExclusive(async () => {
                const payload = new FormData();
                payload.append('to', sendState.to);
                if (sendState.cc?.trim()) {
                    payload.append('cc', sendState.cc);
                }
                if (sendState.bcc?.trim()) {
                    payload.append('bcc', sendState.bcc);
                }
                payload.append('subject', sendState.subject);
                payload.append('body', sendState.body);
                payload.append('html', sendState.html);
                if (sendState.inReplyTo) {
                    payload.append('inReplyTo', sendState.inReplyTo);
                }
                if (sendState.references.length) {
                    payload.append('references', sendState.references.join(','));
                }
                if (draftIdRef.current) {
                    payload.append('draftId', draftIdRef.current);
                }
                payload.append('retained_attachments', JSON.stringify(
                    savedAttachmentsRef.current.map((attachment) => attachment.attachment_id).filter(Boolean)
                ));
                newAttachmentsRef.current.forEach((file) => payload.append('attachments', file));
                const forwardedRefs = forwardedAttachments
                    .map((attachment) => ({
                        emailId: attachment.emailId,
                        attachmentId: attachment.attachmentId
                    }))
                    .filter((attachment) => attachment.emailId && attachment.attachmentId);
                if (forwardedRefs.length) {
                    payload.append('forwardedAttachments', JSON.stringify(forwardedRefs));
                }

                const sendResult = await sendEmailService.call(payload);
                if (sendResult.error) {
                    return sendResult;
                }

                saveQueueRef.current.close();
                if (draftIdRef.current) {
                    await deleteEmailsService.call([draftIdRef.current], '', { silent: true });
                    window.dispatchEvent(new CustomEvent('mailshot:draft-saved'));
                }
                return sendResult;
            });
        } catch (error) {
            result = { error: error instanceof Error ? error.message : 'Unable to send message' };
        }
        if (result.cancelled) {
            sendStartedRef.current = false;
            setSendQueued(false);
            return;
        }
        if (result.error) {
            sendStartedRef.current = false;
            setSendQueued(false);
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        setSnackbar({ open: true, message: 'Message sent', severity: 'success' });
        closeCompose(composeId);
        resetForm();
        if (onSent) {
            onSent();
        }
    };

    const saveDraftAndClose = async () => {
        const hasAnyDraftContent = hasDraftContent({ ...data, to: getToValue() }) || savedAttachments.length > 0 || newAttachments.length > 0;
        if (!hasAnyDraftContent || (!draftIdRef.current && !hasUserEditedRef.current)) {
            closeCompose(composeId);
            resetForm();
            return;
        }

        const result = await saveDraft({ silent: false });
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        closeCompose(composeId);
        resetForm();
    };

    const removeSavedAttachment = (attachmentId) => {
        hasUserEditedRef.current = true;
        replaceSavedAttachments((current) => current.filter((attachment) => attachment.attachment_id !== attachmentId));
    };

    const removeNewAttachment = (targetIndex) => {
        hasUserEditedRef.current = true;
        replaceNewAttachments((current) => current.filter((_, itemIndex) => itemIndex !== targetIndex));
    };

    const isMinimized = composeState === 'minimized';
    const windowClass = getWindowClass(composeState, isMobile);
    const desktopOffset = isMinimized ? index * 19 : index * 36;
    const positionStyle = composeState === 'expanded' && isMobile
        ? undefined
        : { right: isMobile ? '0.75rem' : `${1.5 + desktopOffset}rem` };

    return (
        <div
            style={positionStyle}
            className={`fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all ${
                composeState === 'expanded' && isMobile ? 'left-0 top-0' : 'bottom-0'
            } ${windowClass}`}
        >
            <div
                className="flex min-h-11 items-center justify-between bg-slate-800 px-3 text-white"
                onClick={isMinimized ? () => setComposeState(composeId, 'normal') : undefined}
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
                            onClick={() => setComposeState(composeId, composeState === 'expanded' ? 'normal' : 'expanded')}
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
                            setComposeState(composeId, isMinimized ? 'normal' : 'minimized');
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
                <form
                    onSubmit={sendEmail}
                    onDragOver={(event) => {
                        if (isFileDropEvent(event)) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'copy';
                        }
                    }}
                    onDrop={addAttachments}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="space-y-0 border-b border-slate-100">
                        <div className="flex items-start gap-2 px-3 py-2">
                            <span className="w-8 text-xs text-slate-500">To</span>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                {toRecipients.map((recipient) => (
                                    <span
                                        key={recipient}
                                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 ring-1 ring-blue-100"
                                    >
                                        <span className="max-w-[12rem] truncate">{recipient}</span>
                                        <button
                                            type="button"
                                            className="rounded-full text-blue-500 hover:text-blue-800"
                                            onClick={() => removeToRecipient(recipient)}
                                            aria-label={`Remove ${recipient}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                <input
                                    name="to"
                                    list={contactListId}
                                    value={toInput}
                                    onChange={updateToInput}
                                    onBlur={finalizeToInput}
                                    onKeyDown={onToKeyDown}
                                    className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
                                />
                            </div>
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

                    <datalist id={contactListId}>
                        {contactOptions.map((contact) => (
                            <option key={contact._id} value={contact.email}>{contact.name}</option>
                        ))}
                    </datalist>

                    <ComposeBodyEditor
                        ref={bodyRef}
                        value={data.html}
                        onChange={onBodyHtmlChange}
                        placeholder="Write your message"
                        className="min-h-0 flex-1 overflow-hidden"
                    />

                    {(savedAttachments.length > 0 || newAttachments.length > 0 || forwardedAttachments.length > 0) && (
                        <div className="shrink-0 space-y-2 border-t border-slate-100 px-3 py-2">
                            <p className="text-xs font-medium text-slate-500">
                                {savedAttachments.length + newAttachments.length + forwardedAttachments.length} attachment{savedAttachments.length + newAttachments.length + forwardedAttachments.length === 1 ? '' : 's'} will be sent with this email
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {forwardedAttachments.map((attachment, itemIndex) => (
                                    <div key={`${attachment.emailId}-${attachment.attachmentId}-${itemIndex}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-slate-700">{attachment.name || attachment.filename || 'attachment'}</p>
                                            <p className="text-[11px] text-slate-500">{formatFileSize(attachment.size)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-full p-1.5 text-slate-500 hover:bg-white hover:text-red-600"
                                            onClick={() => setForwardedAttachments((current) => current.filter((_, indexToKeep) => indexToKeep !== itemIndex))}
                                            aria-label={`Remove ${attachment.name || attachment.filename || 'attachment'}`}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                                {savedAttachments.map((attachment) => (
                                    <div key={attachment.attachment_id} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-slate-700">{attachment.filename}</p>
                                            <p className="text-[11px] text-slate-500">{formatFileSize(attachment.size)}</p>
                                        </div>
                                        <a
                                            href={`${API_URL}/email/${draftIdRef.current}/attachments/${attachment.attachment_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-full p-1.5 text-slate-500 hover:bg-white hover:text-blue-600"
                                            aria-label={`Download ${attachment.filename}`}
                                        >
                                            <Download className="h-4 w-4" />
                                        </a>
                                        <button
                                            type="button"
                                            className="rounded-full p-1.5 text-slate-500 hover:bg-white hover:text-red-600"
                                            onClick={() => removeSavedAttachment(attachment.attachment_id)}
                                            aria-label={`Remove ${attachment.filename}`}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                                {newAttachments.map((file, itemIndex) => (
                                    <div key={`${file.name}-${file.size}-${itemIndex}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-2">
                                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-slate-700">{file.name}</p>
                                            <p className="text-[11px] text-slate-500">{formatFileSize(file.size)} selected</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-full p-1.5 text-slate-500 hover:bg-white hover:text-red-600"
                                            onClick={() => removeNewAttachment(itemIndex)}
                                            aria-label={`Remove ${file.name}`}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-3 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Button type="submit" disabled={sendQueued || sendEmailService.isLoading} className="rounded-full">
                                {sendQueued || sendEmailService.isLoading ? <Spinner size={18} className="border-white/30 border-t-white" /> : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        Send
                                    </>
                                )}
                            </Button>
                            <button
                                type="button"
                                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                                onClick={() => attachmentInputRef.current?.click()}
                            >
                                <Paperclip className="h-4 w-4" />
                                Attach
                            </button>
                            <input
                                ref={attachmentInputRef}
                                hidden
                                type="file"
                                multiple
                                onChange={addAttachments}
                            />
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
};

const ComposeMail = ({ onSent }) => {
    const { composeItems } = useCompose();

    if (!composeItems.length) {
        return null;
    }

    return createPortal(
        <>
            {composeItems.map((item, index) => (
                <ComposeWindow
                    key={item.id}
                    item={item}
                    index={index}
                    onSent={onSent}
                />
            ))}
        </>,
        document.body
    );
};

export default ComposeMail;
