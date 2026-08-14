import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, FileText, Image, Maximize2, Minimize2, Minus, Paperclip, Send, Trash2, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { MAIL_FROM, MAILBOX_USER } from '../config/env';
import { useCompose } from '../context/ComposeContext';
import { useLayout } from '../context/LayoutContext';
import {
    applySignatureHtml,
    htmlToPlainText,
    normalizeSignatureOptions
} from '../utils/signatureComposer';
import {
    appendComposeAttachments,
    describeComposeAttachments,
    removeComposeAttachmentAt
} from '../utils/composeAttachments';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
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
    draft.body_html || draft.html || (draft.body ? plainTextToHtml(draft.body) : '')
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

    const syncEditor = () => {
        onChange(editorRef.current?.innerHTML || '');
    };

    return (
        <div className={`relative ${className}`}>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={placeholder}
                className="h-full min-h-[180px] overflow-y-auto px-3 py-3 text-sm leading-6 text-slate-900 outline-none [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:rounded-md"
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

const hasDraftContent = (draft = {}) => (
    ['to', 'cc', 'bcc', 'subject', 'body', 'html', 'body_html'].some((field) => String(draft[field] || '').trim())
);

const formatFileSize = (size = 0) => {
    const bytes = Number(size) || 0;
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }
    return `${bytes} B`;
};

const getAttachmentKind = (file) => {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    return 'file';
};

const isForwardedAttachment = (file) => file?.source === 'forwarded';

const getAttachmentDisplayName = (file) => file?.name || file?.filename || 'attachment';

const getAttachmentKey = (file, index) => (
    isForwardedAttachment(file)
        ? `forwarded-${file.emailId}-${file.attachmentId}-${index}`
        : `${file.name}-${file.size}-${file.lastModified}-${index}`
);

const ComposeMail = ({ onSent }) => {
    const { isOpen, composeState, draft, closeCompose, setComposeState } = useCompose();
    const { isMobile } = useLayout();
    const [data, setData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', html: '' });
    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const [previewFile, setPreviewFile] = useState(null);
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
                signatures = normalizeSignatureOptions(settingsResult.data?.general || {}, MAIL_FROM || 'paul@tensology.com');
            }

            const baseHtml = resolveDraftHtml(draft);
            const selectedSignature = signatures.find((entry) => baseHtml.trim().endsWith(entry.html))
                || signatures[0]
                || { email: '', html: '', text: '' };
            const shouldApplySignature = selectedSignature.html && !draft.in_reply_to;
            const nextHtml = shouldApplySignature
                ? applySignatureHtml(baseHtml, selectedSignature.html)
                : baseHtml;
            if (!cancelled) {
                appliedSignatureRef.current = shouldApplySignature ? selectedSignature.html : '';
                setSignatureOptions(signatures);
                setSelectedSignatureEmail(selectedSignature.email || '');
                setData({
                    to: draft.to || '',
                    cc: draft.cc || '',
                    bcc: draft.bcc || '',
                    subject: draft.subject || '',
                    body: htmlToPlainText(nextHtml),
                    html: sanitizeComposeHtml(nextHtml)
                });
            }
        };

        loadComposeState();
        draftIdRef.current = draft._id || draft.id || '';
        hasUserEditedRef.current = false;
        lastSavedDraftRef.current = '';
        setShowCc(Boolean(draft.show_cc || draft.cc));
        setShowBcc(Boolean(draft.show_bcc || draft.bcc));
        setAttachments(Array.isArray(draft.forwarded_attachments) ? draft.forwarded_attachments : []);
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

    useEffect(() => () => {
        if (previewFile?.url) {
            URL.revokeObjectURL(previewFile.url);
        }
    }, [previewFile]);

    const onValueChange = (event) => {
        hasUserEditedRef.current = true;
        setData({ ...data, [event.target.name]: event.target.value });
    };

    const onAttachmentChange = (event) => {
        hasUserEditedRef.current = true;
        setAttachments((current) => appendComposeAttachments(current, event.target.files || []));
        event.target.value = '';
    };

    const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

    const onDragOver = (event) => {
        if (!hasDraggedFiles(event)) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsDraggingFiles(true);
    };

    const onDragLeave = (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsDraggingFiles(false);
        }
    };

    const onDropFiles = (event) => {
        if (!hasDraggedFiles(event)) {
            return;
        }
        event.preventDefault();
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length) {
            hasUserEditedRef.current = true;
            setAttachments((current) => appendComposeAttachments(current, files));
            setSnackbar({
                open: true,
                message: `${files.length} file${files.length === 1 ? '' : 's'} attached`,
                severity: 'success'
            });
        }
        setIsDraggingFiles(false);
    };

    const removeAttachment = (index) => {
        hasUserEditedRef.current = true;
        setAttachments((current) => removeComposeAttachmentAt(current, index));
    };

    const openAttachmentPreview = (file) => {
        const kind = getAttachmentKind(file);
        if (!['image', 'video', 'pdf'].includes(kind)) {
            return;
        }

        if (isForwardedAttachment(file)) {
            setPreviewFile({
                file,
                kind,
                url: file.url || ''
            });
            return;
        }

        setPreviewFile({
            file,
            kind,
            url: URL.createObjectURL(file)
        });
    };

    const closeAttachmentPreview = () => {
        if (previewFile?.url) {
            URL.revokeObjectURL(previewFile.url);
        }
        setPreviewFile(null);
    };

    const resetForm = () => {
        setData({ to: '', cc: '', bcc: '', subject: '', body: '', html: '' });
        setShowCc(false);
        setShowBcc(false);
        setAttachments([]);
        setPreviewFile(null);
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
        setData((current) => ({
            ...current,
            ...(() => {
                const html = sanitizeComposeHtml(applySignatureHtml(current.html, nextSignature, previousSignature));
                return {
                    html,
                    body: htmlToPlainText(html)
                };
            })()
        }));
    };

    const onBodyHtmlChange = (html) => {
        const sanitized = sanitizeComposeHtml(html);
        hasUserEditedRef.current = true;
        setData((current) => ({
            ...current,
            html: sanitized,
            body: htmlToPlainText(sanitized)
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
            body_html: data.html,
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
            body: draftPayload.body,
            body_html: draftPayload.body_html
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
            body: draftPayload.body,
            body_html: draftPayload.body_html
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
        payload.append('html', data.html || '');
        if (draft.in_reply_to) {
            payload.append('inReplyTo', draft.in_reply_to);
        }
        if (draft.references?.length) {
            payload.append('references', draft.references.join(','));
        }
        const forwardedAttachments = attachments
            .filter(isForwardedAttachment)
            .map((file) => ({
                emailId: file.emailId,
                attachmentId: file.attachmentId
            }))
            .filter((file) => file.emailId && file.attachmentId);
        attachments
            .filter((file) => !isForwardedAttachment(file))
            .forEach((file) => payload.append('attachments', file));
        if (forwardedAttachments.length > 0) {
            payload.append('forwardedAttachments', JSON.stringify(forwardedAttachments));
        }

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
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropFiles}
            className={`fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all ${
                composeState === 'expanded' && isMobile ? 'left-0 top-0' : 'right-3 bottom-0 sm:right-6'
            } ${windowClass}`}
        >
            {isDraggingFiles && !isMinimized && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/85">
                    <div className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-lg">
                        Drop files to attach
                    </div>
                </div>
            )}
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

                    <ComposeBodyEditor
                        ref={bodyRef}
                        value={data.html}
                        onChange={onBodyHtmlChange}
                        placeholder="Write your message"
                        className="min-h-0 flex-1"
                    />

                    {attachments.length > 0 && (
                        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2">
                            <p className="mb-2 text-xs font-medium text-slate-600">
                                {describeComposeAttachments(attachments)}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {attachments.map((file, index) => {
                                    const kind = getAttachmentKind(file);
                                    const canPreview = ['image', 'video', 'pdf'].includes(kind);
                                    const FileIcon = kind === 'image' ? Image : FileText;
                                    const displayName = getAttachmentDisplayName(file);
                                    return (
                                        <div key={getAttachmentKey(file, index)} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                                            <FileIcon className="h-4 w-4 shrink-0 text-slate-500" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold text-slate-800" title={displayName}>{displayName}</p>
                                                <p className="text-[11px] text-slate-500">{formatFileSize(file.size)}</p>
                                            </div>
                                            {canPreview && (
                                                <button
                                                    type="button"
                                                    onClick={() => openAttachmentPreview(file)}
                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                                                    aria-label={`Preview ${displayName}`}
                                                    title={`Preview ${displayName}`}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => removeAttachment(index)}
                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                                                aria-label={`Remove ${displayName}`}
                                                title={`Remove ${displayName}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
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
            {previewFile && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4" onClick={closeAttachmentPreview}>
                    <div className="flex h-[min(42rem,90vh)] w-[min(64rem,96vw)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">{previewFile.file.name}</p>
                                <p className="text-xs text-slate-500">{formatFileSize(previewFile.file.size)}</p>
                            </div>
                            <IconButton label="Close preview" size="sm" onClick={closeAttachmentPreview}>
                                <X className="h-4 w-4" />
                            </IconButton>
                        </div>
                        <div className="min-h-0 flex-1 bg-slate-100">
                            {previewFile.kind === 'image' && <img src={previewFile.url} alt="" className="h-full w-full object-contain" />}
                            {previewFile.kind === 'video' && <video src={previewFile.url} controls autoPlay className="h-full w-full bg-black" />}
                            {previewFile.kind === 'pdf' && <object data={previewFile.url} type="application/pdf" className="h-full w-full bg-white" />}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(composeWindow, document.body);
};

export default ComposeMail;
