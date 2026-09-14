import { useEffect, useState } from 'react';
import {
    Archive,
    ArchiveRestore,
    ArrowLeft,
    Download,
    ExternalLink,
    FileText,
    Forward,
    Loader2,
    Mail,
    Play,
    Reply,
    ReplyAll,
    Trash2,
    Volume2,
    X
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import {
    markEmailReadInCache,
    requestMailboxCountsRefresh,
    removeEmailsFromListCache,
    setActionNotice,
    emitEmailsRestored
} from '../utils/emailListCache';
import {
    buildForwardBody,
    buildReplyAllRecipients,
    buildReplyBody,
    buildReplyRecipients
} from '../utils/recipients';
import { useCompose } from '../context/ComposeContext';
import ConfirmDialog from './common/ConfirmDialog';
import MoveToLabelMenu from './MoveToLabelMenu';
import ThreadMessage from './ThreadMessage';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
import Toast from './ui/Toast';
import { buildLabelNameMap, getLabelDisplayName } from '../utils/labels';
import { formatEmailBody } from '../utils/emailFormatter';
import { useReadSummary } from '../context/ReadSummaryContext';
import { useUndoDelete } from '../context/UndoDeleteContext';
import { isDeleteKeyboardShortcut, getThreadSelectionIds } from '../utils/mailActions';
import { getVisibleAttachments } from '../utils/attachments';
import { getEmbeddableLinks } from '../utils/linkPreviews';
import {
    downloadAttachment,
    isSafeAttachmentPreviewType,
    loadAttachmentPreview
} from '../utils/downloadAttachment';

const ViewEmail = () => {
    const { openComposeDraft } = useCompose();
    const getThreadService = useApi(API_URLS.getEmailThread);
    const getLabelsService = useApi(API_URLS.getLabels);
    const updateEmailLabelsService = useApi(API_URLS.updateEmailLabels);
    const toggleReadService = useApi(API_URLS.toggleReadMail);
    const archiveEmailsService = useApi(API_URLS.archiveEmails);
    const restoreArchivedEmailsService = useApi(API_URLS.restoreArchivedEmails);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const restoreEmailsFromBin = useApi(API_URLS.restoreEmailsFromBin);
    const downloadAttachmentService = useApi(API_URLS.downloadAttachment);
    const { showUndoDelete } = useUndoDelete();
    const {
        enabled: readSummaryEnabled,
        pendingEmailId: readSummaryPendingEmailId,
        startReadSummary
    } = useReadSummary();
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [labels, setLabels] = useState([]);
    const [emailLabels, setEmailLabels] = useState([]);
    const [thread, setThread] = useState([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [loadError, setLoadError] = useState('');
    const [previewItem, setPreviewItem] = useState(null);
    const { type, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const backUrl = `/emails/${type || 'inbox'}${location.search || ''}`;

    useEffect(() => () => {
        if (previewItem?.objectUrl) {
            URL.revokeObjectURL(previewItem.objectUrl);
        }
    }, [previewItem]);

    useEffect(() => {
        if (!id) {
            return;
        }

        markEmailReadInCache(id);
        setThread((current) => current.map((message) => ({ ...message, read: true })));
        toggleReadService.call({ id, value: true }, '', { silent: true }).then(() => {
            requestMailboxCountsRefresh();
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        const loadThread = async () => {
            if (!id) {
                return;
            }

            setLoadError('');
            const result = await getThreadService.call({}, `${id}/thread`);
            if (result.error) {
                setLoadError(result.error);
                setThread([]);
                return;
            }

            const messages = Array.isArray(result.data) ? result.data : [];
            setThread(messages.map((message) => ({ ...message, read: true })));
            markEmailReadInCache([id, ...messages.map((message) => message._id)]);
            requestMailboxCountsRefresh();
        };

        loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        getLabelsService.call();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (Array.isArray(getLabelsService.response)) {
            setLabels(getLabelsService.response);
        }
    }, [getLabelsService.response]);

    const sortedThread = [...thread].sort((left, right) => new Date(right.date) - new Date(left.date));
    const latestEmailId = sortedThread[0]?._id || '';
    const primaryEmail = sortedThread[0] || thread.find((message) => message._id === id) || null;

    useEffect(() => {
        if (primaryEmail?.labels) {
            setEmailLabels(primaryEmail.labels);
        }
    }, [primaryEmail]);

    useEffect(() => {
        if (!primaryEmail || confirmDeleteOpen) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (!isDeleteKeyboardShortcut(event)) {
                return;
            }

            event.preventDefault();
            setConfirmDeleteOpen(true);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [confirmDeleteOpen, primaryEmail]);

    if (getThreadService.isLoading) {
        return (
            <div className="flex items-center justify-center gap-3 py-16">
                <Spinner size={28} />
                <span className="text-sm text-slate-500">Loading message…</span>
            </div>
        );
    }

    if (!primaryEmail || loadError) {
        return (
            <div className="px-4 py-8 sm:px-6">
                <h1 className="text-lg font-semibold text-slate-900">Could not load this message.</h1>
                {loadError && <p className="mt-2 text-sm text-slate-600">{loadError}</p>}
                <Button className="mt-4" onClick={() => navigate(backUrl)}>
                    Back to inbox
                </Button>
            </div>
        );
    }

    const subject = primaryEmail?.subject || '(no subject)';
    const isArchivedView = type === 'archived';
    const canToggleArchive = !['bin', 'spam', 'sent', 'drafts'].includes(type || '');
    const archiveActionLabel = isArchivedView ? 'Unarchive' : 'Archive';
    const ArchiveIcon = isArchivedView ? ArchiveRestore : Archive;
    const downloadMessageAttachment = async (path, filename) => {
        const result = await downloadAttachment({
            call: downloadAttachmentService.call,
            path,
            filename
        });
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
        }
    };

    const openReplyDraft = (message, plainBody, mode) => {
        const replySubject = (message.subject || '').startsWith('Re:')
            ? message.subject
            : `Re: ${message.subject || '(no subject)'}`;
        const references = [...(message.references || []), message.messageId].filter(Boolean);

        if (mode === 'forward') {
            const forwardedAttachments = getVisibleAttachments(message).map((attachment) => ({
                source: 'forwarded',
                emailId: String(message._id || ''),
                attachmentId: String(attachment.attachment_id || ''),
                name: attachment.filename || 'attachment',
                filename: attachment.filename || 'attachment',
                size: Number(attachment.size || 0),
                type: attachment.content_type || 'application/octet-stream',
                content_type: attachment.content_type || 'application/octet-stream',
                url: ''
            })).filter((attachment) => attachment.emailId && attachment.attachmentId);

            openComposeDraft({
                to: '',
                subject: (message.subject || '').startsWith('Fwd:') ? message.subject : `Fwd: ${message.subject || '(no subject)'}`,
                body: buildForwardBody(message, plainBody),
                forwarded_attachments: forwardedAttachments,
                title: 'Forward'
            });
            return;
        }

        if (mode === 'reply-all') {
            const { to, cc } = buildReplyAllRecipients(message);
            openComposeDraft({
                to,
                cc,
                show_cc: Boolean(cc),
                subject: replySubject,
                body: buildReplyBody(message, plainBody),
                in_reply_to: message.messageId || '',
                references,
                title: 'Reply all'
            });
            return;
        }

        openComposeDraft({
            to: buildReplyRecipients(message).join(', '),
            subject: replySubject,
            body: buildReplyBody(message, plainBody),
            in_reply_to: message.messageId || '',
            references,
            title: 'Reply'
        });
    };

    const saveLabels = async (nextLabels) => {
        setEmailLabels(nextLabels);
        const result = await updateEmailLabelsService.call({ labels: nextLabels }, `${primaryEmail._id}/labels`);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
        }
    };

    const getCurrentEmailSelectionIds = () => getThreadSelectionIds({
        thread,
        primaryEmail,
        fallbackId: id
    });

    const moveToLabel = (labelSlug, ids, error) => {
        if (error) {
            setSnackbar({ open: true, message: error, severity: 'error' });
            return;
        }

        setEmailLabels((current) => (
            current.includes(labelSlug) ? current : [...current, labelSlug]
        ));

        if (type === 'inbox' || type === 'bin') {
            removeEmailsFromListCache(ids?.length ? ids : getCurrentEmailSelectionIds());
            navigate(backUrl);
        }
    };

    const confirmMoveToLabel = (labelSlug) => {
        const message = `Moved to ${getLabelDisplayName(labelSlug, buildLabelNameMap(labels))}`;

        if (type === 'inbox' || type === 'bin') {
            setActionNotice(message);
            return;
        }

        setSnackbar({ open: true, message, severity: 'success' });
    };

    const deleteEmail = async () => {
        const idsToDelete = getCurrentEmailSelectionIds();
        const isPermanentDelete = type === 'bin';
        const restoredEmails = thread.length ? [...thread] : [{ ...primaryEmail }];

        setConfirmDeleteOpen(false);

        const apiCall = isPermanentDelete
            ? deleteEmailsService.call(idsToDelete)
            : moveEmailsToBin.call(idsToDelete);

        const result = await apiCall;
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        removeEmailsFromListCache(idsToDelete);
        requestMailboxCountsRefresh();

        if (isPermanentDelete) {
            setActionNotice('Message deleted permanently');
            navigate(backUrl);
            return;
        }

        showUndoDelete({
            message: 'Message moved to Bin',
            restore: async () => {
                const restoreResult = await restoreEmailsFromBin.call(idsToDelete);
                if (restoreResult.error) {
                    setSnackbar({ open: true, message: restoreResult.error, severity: 'error' });
                    throw new Error(restoreResult.error);
                }

                emitEmailsRestored(restoredEmails, idsToDelete);
                requestMailboxCountsRefresh();
                setSnackbar({ open: true, message: 'Message restored', severity: 'success' });
            }
        });

        navigate(backUrl);
    };

    const toggleArchive = async () => {
        const ids = getCurrentEmailSelectionIds();
        const service = isArchivedView ? restoreArchivedEmailsService : archiveEmailsService;
        const result = await service.call(ids);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        removeEmailsFromListCache(ids);
        requestMailboxCountsRefresh();
        setActionNotice(`Message ${isArchivedView ? 'unarchived' : 'archived'}`);
        navigate(backUrl);
    };

    const markAsUnread = async () => {
        const ids = getCurrentEmailSelectionIds();
        const result = await toggleReadService.call({ ids, value: false });
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        markEmailReadInCache(ids, false);
        requestMailboxCountsRefresh();
        setActionNotice('Marked as unread');
        navigate(backUrl);
    };

    const openPrimaryReplyDraft = (mode) => {
        if (!primaryEmail) {
            return;
        }

        openReplyDraft(primaryEmail, formatEmailBody(primaryEmail.body), mode);
    };

    const startCurrentReadSummary = async () => {
        if (!primaryEmail) {
            return;
        }

        const result = await startReadSummary(primaryEmail._id, {
            audioReady: primaryEmail.read_aloud_status === 'ready',
            summaryPreview: primaryEmail.read_summary_status === 'ready' ? primaryEmail.read_summary : ''
        });
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
        }
    };

    const readSummaryLoading = readSummaryPendingEmailId === primaryEmail._id;
    const readAloudReady = primaryEmail.read_aloud_status === 'ready';
    const renderMessageAttachments = (message) => {
        const messageAttachments = getVisibleAttachments(message);
        if (!messageAttachments.length) {
            return null;
        }

        return (
            <footer className="mx-auto mt-3 w-full border-t border-slate-200 bg-slate-50/80 px-3 py-4 sm:rounded-xl sm:border">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900">Attachments</h2>
                        <p className="text-xs text-slate-500">
                            {messageAttachments.length} file{messageAttachments.length === 1 ? '' : 's'}
                        </p>
                    </div>
                    {messageAttachments.length > 1 && (
                        <button
                            type="button"
                            onClick={() => downloadMessageAttachment(`${message._id}/attachments.zip`, `${message.subject || 'attachments'}.zip`)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Download all
                        </button>
                    )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {messageAttachments.map((attachment) => {
                        const contentType = String(attachment.content_type || '').toLowerCase();
                        const filename = attachment.filename || 'attachment';
                        const isPdf = contentType === 'application/pdf';
                        const isImage = contentType.startsWith('image/') && contentType !== 'image/svg+xml';
                        const isVideo = contentType.startsWith('video/');
                        const canPreview = isSafeAttachmentPreviewType(contentType) && (isPdf || isImage || isVideo);
                        const openPreview = async () => {
                            if (!canPreview) return;
                            const result = await loadAttachmentPreview({
                                call: downloadAttachmentService.call,
                                path: `${attachment.emailId}/attachments/${attachment.attachment_id}`
                            });
                            if (result.error) {
                                setSnackbar({ open: true, message: result.error, severity: 'error' });
                                return;
                            }
                            setPreviewItem({
                                kind: isPdf ? 'pdf' : isImage ? 'image' : 'video',
                                title: filename,
                                url: result.data,
                                objectUrl: result.data
                            });
                        };

                        return (
                            <article
                                key={`${attachment.emailId}-${attachment.attachment_id}`}
                                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                                onDoubleClick={openPreview}
                            >
                                <button
                                    type="button"
                                    disabled={!canPreview}
                                    onClick={openPreview}
                                    className="flex h-24 w-full items-center justify-center bg-slate-100 disabled:cursor-default"
                                    aria-label={canPreview ? `Preview ${filename}` : filename}
                                >
                                    {isVideo ? (
                                        <div className="flex flex-col items-center gap-1 text-slate-500">
                                            <Play className="h-7 w-7" />
                                            <span className="text-[11px]">Video</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-slate-500">
                                            <FileText className="h-7 w-7" />
                                        </div>
                                    )}
                                </button>
                                <div className="space-y-2 p-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-slate-800" title={filename}>
                                            {filename}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            {attachment.size ? `${Math.round(Number(attachment.size) / 1024)} KB` : contentType || 'File'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => downloadMessageAttachment(`${attachment.emailId}/attachments/${attachment.attachment_id}`, filename)}
                                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                            Download
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!canPreview}
                                            onClick={openPreview}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                                            aria-label={canPreview ? `Preview ${filename}` : `No preview for ${filename}`}
                                            title={canPreview ? `Preview ${filename}` : 'Preview unavailable'}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </footer>
        );
    };
    const renderMessageLinks = (message) => {
        const messageLinks = getEmbeddableLinks(message);
        if (!messageLinks.length) {
            return null;
        }

        return (
            <footer className="mx-auto mt-3 w-full border-t border-slate-200 bg-slate-50/80 px-3 py-4 sm:rounded-xl sm:border">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Linked media</h2>
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {messageLinks.map((link) => (
                        <button
                            key={link.url}
                            type="button"
                            onClick={() => setPreviewItem({
                                kind: 'embed',
                                title: link.label,
                                url: link.embedUrl,
                                sourceUrl: link.url
                            })}
                            className="flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                        >
                            {link.type === 'youtube' ? <Play className="h-7 w-7 text-red-600" /> : <ExternalLink className="h-7 w-7 text-blue-600" />}
                            <span className="text-xs font-semibold">{link.label}</span>
                        </button>
                    ))}
                </div>
            </footer>
        );
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div
                role="toolbar"
                aria-label="Email actions"
                className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-100 bg-white/95 px-2 py-1.5 backdrop-blur sm:px-4 lg:py-2"
            >
                <div className="flex shrink-0 items-center gap-1">
                    <IconButton size="touch" label="Back" onClick={() => navigate(backUrl)}>
                        <ArrowLeft className="h-5 w-5" />
                    </IconButton>
                    {labels.length > 0 && primaryEmail && (
                        <MoveToLabelMenu
                            emailIds={getCurrentEmailSelectionIds()}
                            labels={labels}
                            onMoved={moveToLabel}
                            onMoveConfirmed={confirmMoveToLabel}
                            buttonSize="touch"
                        />
                    )}
                    <IconButton size="touch" label="Delete" onClick={() => setConfirmDeleteOpen(true)}>
                        <Trash2 className="h-5 w-5" />
                    </IconButton>
                    <IconButton size="touch" label="Mark as unread" onClick={markAsUnread}>
                        <Mail className="h-5 w-5" />
                    </IconButton>
                    {canToggleArchive && (
                        <IconButton size="touch" label={archiveActionLabel} onClick={toggleArchive}>
                            <ArchiveIcon className="h-5 w-5" />
                        </IconButton>
                    )}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {readSummaryEnabled && (
                        <IconButton
                            size="touch"
                            label={readSummaryLoading ? 'Preparing read summary' : readAloudReady ? 'Read summary (ready)' : 'Read Summary'}
                            onClick={startCurrentReadSummary}
                            disabled={readSummaryLoading}
                            className={readAloudReady ? 'text-green-600 hover:bg-green-50' : 'text-blue-600 hover:bg-blue-50'}
                        >
                            {readSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Volume2 className="h-5 w-5" />}
                        </IconButton>
                    )}
                    <IconButton size="touch" label="Reply" onClick={() => openPrimaryReplyDraft('reply')}>
                        <Reply className="h-5 w-5" />
                    </IconButton>
                    <IconButton size="touch" label="Reply all" onClick={() => openPrimaryReplyDraft('reply-all')}>
                        <ReplyAll className="h-5 w-5" />
                    </IconButton>
                    <IconButton size="touch" label="Forward" onClick={() => openPrimaryReplyDraft('forward')}>
                        <Forward className="h-5 w-5" />
                    </IconButton>
                </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                <div className="mx-auto w-full max-w-[min(100%,72rem)]">
                    <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-center">
                        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{subject}</h1>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            {primaryEmail.type || 'inbox'}
                        </span>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                        {emailLabels.map((label) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => saveLabels(emailLabels.filter((item) => item !== label))}
                                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                            >
                                {getLabelDisplayName(label, buildLabelNameMap(labels))} ×
                            </button>
                        ))}
                    </div>

                    <div>
                        {sortedThread.map((message) => (
                            <div key={message._id || message.messageId}>
                                <ThreadMessage message={message} isLatest={message._id === latestEmailId} />
                                {renderMessageAttachments(message)}
                                {renderMessageLinks(message)}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {previewItem && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setPreviewItem(null)}>
                    <div className="flex h-[min(42rem,90vh)] w-[min(64rem,96vw)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">{previewItem.title}</p>
                                {previewItem.sourceUrl && <p className="truncate text-xs text-slate-500">{previewItem.sourceUrl}</p>}
                            </div>
                            {previewItem.sourceUrl && (
                                <a href={previewItem.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    Open source
                                </a>
                            )}
                            <IconButton label="Close preview" size="sm" onClick={() => setPreviewItem(null)}>
                                <X className="h-4 w-4" />
                            </IconButton>
                        </div>
                        <div className="min-h-0 flex-1 bg-slate-100">
                            {previewItem.kind === 'image' && <img src={previewItem.url} alt="" className="h-full w-full object-contain" />}
                            {previewItem.kind === 'video' && <video src={previewItem.url} controls autoPlay className="h-full w-full bg-black" />}
                            {previewItem.kind === 'pdf' && <object data={`${previewItem.url}#page=1`} type="application/pdf" className="h-full w-full bg-white" />}
                            {previewItem.kind === 'embed' && <iframe src={previewItem.url} title={previewItem.title} className="h-full w-full border-0 bg-white" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmDeleteOpen}
                title={type === 'bin' ? 'Delete forever?' : 'Move to Bin?'}
                message={type === 'bin'
                    ? 'Permanently delete this message? This cannot be undone.'
                    : 'Move this message to Bin?'}
                confirmLabel={type === 'bin' ? 'Delete forever' : 'Move to Bin'}
                onConfirm={deleteEmail}
                onCancel={() => setConfirmDeleteOpen(false)}
            />

            <Toast
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            />
        </div>
    );
};

export default ViewEmail;
