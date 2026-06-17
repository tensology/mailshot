import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Forward, Loader2, Reply, ReplyAll, Trash2, Volume2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';
import {
    markEmailReadInCache,
    requestMailboxCountsRefresh,
    removeEmailsFromListCache,
    setActionNotice
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

const ViewEmail = () => {
    const { openComposeDraft } = useCompose();
    const getThreadService = useApi(API_URLS.getEmailThread);
    const getLabelsService = useApi(API_URLS.getLabels);
    const updateEmailLabelsService = useApi(API_URLS.updateEmailLabels);
    const toggleReadService = useApi(API_URLS.toggleReadMail);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
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
    const { type, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const backUrl = `/emails/${type || 'inbox'}${location.search || ''}`;

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

    const primaryEmail = thread.find((message) => message._id === id) || thread[thread.length - 1] || null;

    useEffect(() => {
        if (primaryEmail?.labels) {
            setEmailLabels(primaryEmail.labels);
        }
    }, [primaryEmail]);

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

    const openReplyDraft = (message, plainBody, mode) => {
        const replySubject = (message.subject || '').startsWith('Re:')
            ? message.subject
            : `Re: ${message.subject || '(no subject)'}`;
        const references = [...(message.references || []), message.messageId].filter(Boolean);

        if (mode === 'forward') {
            openComposeDraft({
                to: '',
                subject: (message.subject || '').startsWith('Fwd:') ? message.subject : `Fwd: ${message.subject || '(no subject)'}`,
                body: buildForwardBody(message, plainBody),
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

    const moveToLabel = (labelSlug, ids, error) => {
        if (error) {
            setSnackbar({ open: true, message: error, severity: 'error' });
            return;
        }

        setEmailLabels((current) => (
            current.includes(labelSlug) ? current : [...current, labelSlug]
        ));

        if (type === 'inbox') {
            removeEmailsFromListCache([primaryEmail._id]);
            navigate('/emails/inbox');
        }
    };

    const confirmMoveToLabel = (labelSlug) => {
        const message = `Moved to ${getLabelDisplayName(labelSlug, buildLabelNameMap(labels))}`;

        if (type === 'inbox') {
            setActionNotice(message);
            return;
        }

        setSnackbar({ open: true, message, severity: 'success' });
    };

    const deleteEmail = async () => {
        const idsToDelete = Array.isArray(primaryEmail.thread_ids) && primaryEmail.thread_ids.length
            ? primaryEmail.thread_ids
            : [primaryEmail._id];
        const isPermanentDelete = type === 'bin';

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
        setActionNotice(isPermanentDelete ? 'Message deleted permanently' : 'Moved to Bin');
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

        const result = await startReadSummary(primaryEmail._id);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
        }
    };

    const readSummaryLoading = readSummaryPendingEmailId === primaryEmail._id;
    const summaryReady = primaryEmail.read_summary_status === 'ready'
        && Boolean(String(primaryEmail.read_summary || '').trim());

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur sm:px-4">
                <IconButton label="Back" onClick={() => navigate(backUrl)}>
                    <ArrowLeft className="h-5 w-5" />
                </IconButton>
                {labels.length > 0 && primaryEmail && (
                    <MoveToLabelMenu
                        emailIds={[primaryEmail._id]}
                        labels={labels}
                        onMoved={moveToLabel}
                        onMoveConfirmed={confirmMoveToLabel}
                    />
                )}
                <IconButton label="Delete" onClick={() => setConfirmDeleteOpen(true)}>
                    <Trash2 className="h-5 w-5" />
                </IconButton>
                <div className="ml-auto flex items-center gap-1">
                    {readSummaryEnabled && (
                        <div className="relative">
                            <IconButton
                                label={readSummaryLoading ? 'Preparing read summary' : summaryReady ? 'Read summary (ready)' : 'Read Summary'}
                                onClick={startCurrentReadSummary}
                                disabled={readSummaryLoading}
                            >
                                {readSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Volume2 className="h-5 w-5" />}
                            </IconButton>
                            {summaryReady && !readSummaryLoading && (
                                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                                    <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
                                </span>
                            )}
                        </div>
                    )}
                    <IconButton label="Reply" onClick={() => openPrimaryReplyDraft('reply')}>
                        <Reply className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="Reply all" onClick={() => openPrimaryReplyDraft('reply-all')}>
                        <ReplyAll className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="Forward" onClick={() => openPrimaryReplyDraft('forward')}>
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

                    {Array.isArray(primaryEmail.attachments) && primaryEmail.attachments.length > 0 && (
                        <div className="mb-4 flex flex-wrap justify-center gap-2">
                            {primaryEmail.attachments.map((attachment) => (
                                <a
                                    key={attachment.attachment_id}
                                    href={`${API_URL}/email/${primaryEmail._id}/attachments/${attachment.attachment_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                                >
                                    {attachment.filename}
                                </a>
                            ))}
                        </div>
                    )}

                    <div>
                        {thread.map((message) => (
                            <ThreadMessage
                                key={message._id || message.messageId}
                                message={message}
                            />
                        ))}
                    </div>
                </div>
            </div>

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
