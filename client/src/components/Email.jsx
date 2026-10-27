import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import {
    formatAddressListLabel,
    formatBodyPreview,
    formatEmailDateParts,
    parseAddressList,
} from '../utils/emailFormatter';
import { markEmailReadInCache } from '../utils/emailListCache';
import { getLabelDisplayName } from '../utils/labels';
import { getEmailMailboxType } from '../utils/mailActions';
import MailshotIcon from './ui/MailshotIcon';

const MARQUEE_SPEED_PX_PER_SECOND = 46;
const DOUBLE_TAP_MS = 320;

const MarqueePreview = ({ children }) => {
    const copyRef = useRef(null);
    const [metrics, setMetrics] = useState({ distance: 640, duration: 14 });

    useEffect(() => {
        const updateMetrics = () => {
            const copyWidth = copyRef.current?.getBoundingClientRect().width || 0;
            if (!copyWidth) {
                return;
            }

            setMetrics({
                distance: copyWidth,
                duration: Math.max(10, copyWidth / MARQUEE_SPEED_PX_PER_SECOND)
            });
        };

        updateMetrics();
        const observer = new ResizeObserver(updateMetrics);
        if (copyRef.current) {
            observer.observe(copyRef.current);
        }

        return () => observer.disconnect();
    }, [children]);

    return (
        <span className="mailshot-marquee-viewport hidden min-w-0 flex-1 text-slate-500 sm:inline-flex">
            <span
                className="mailshot-marquee-track"
                style={{
                    '--mailshot-marquee-distance': `${metrics.distance}px`,
                    '--mailshot-marquee-duration': `${metrics.duration}s`
                }}
            >
                <span ref={copyRef} className="mailshot-marquee-copy">{children}</span>
                <span className="mailshot-marquee-copy" aria-hidden="true">{children}</span>
            </span>
        </span>
    );
};

const Email = ({
    email,
    index,
    setStarredEmail,
    checkedEmails,
    highlightedEmail,
    labelNameMap,
    senderColumnWidthCh,
    rowTone,
    readSummaryEnabled,
    readSummaryLoading,
    onReadSummary,
    onReadSummaryContextMenu,
    onRowSelect,
    onCheckboxSelect,
    onKeyboardDelete,
    onKeyboardNavigate,
    onOpenDraft,
    onArchiveToggle,
    archiveActionLabel = 'Archive',
    isArchiveView = false,
    deleteDialogOpen
}) => {
    const toggleStarredEmailService = useApi(API_URLS.toggleStarredMails);
    const navigate = useNavigate();
    const { type } = useParams();
    const [searchParams] = useSearchParams();
    const lastRowTapAt = useRef(0);

    const isDraft = type === 'drafts' || email.type === 'drafts';
    const senderSource = isDraft
        ? email.to
        : email.type === 'sent'
            ? email.to
            : email.from;
    const senderContacts = parseAddressList(senderSource);
    const senderName = formatAddressListLabel(senderSource);
    const visibleSenderContacts = senderContacts.slice(0, 2);
    const hiddenSenderCount = Math.max(0, senderContacts.length - visibleSenderContacts.length);
    const subject = email?.subject || '(no subject)';
    const snippet = formatBodyPreview(email, 260);
    const dateParts = formatEmailDateParts(email.date);
    const hasAttachments = Array.isArray(email.attachments) && email.attachments.length > 0;
    const unread = !email.read;
    const readAloudReady = email.read_aloud_status === 'ready';
    const threadIds = Array.isArray(email.thread_ids) && email.thread_ids.length > 0
        ? email.thread_ids
        : [email._id];
    const isChecked = threadIds.every((id) => checkedEmails.includes(id));
    const isHighlighted = highlightedEmail === email._id;

    const toggleStarredEmail = async (event) => {
        event.stopPropagation();
        await toggleStarredEmailService.call({ id: email._id, value: !email.starred });
        setStarredEmail((prevState) => !prevState);
    };

    const handleCheckboxClick = (event) => {
        event.stopPropagation();
        onCheckboxSelect(email, index, event);
    };

    const openEmail = () => {
        if (isDraft) {
            onOpenDraft?.(email);
            return;
        }

        if (!email.read) {
            markEmailReadInCache(email._id);
        }
        const queryString = searchParams.toString();
        const mailboxType = getEmailMailboxType(email) || type || 'inbox';
        navigate(`${routes.emails.path}/${mailboxType}/${email._id}${queryString ? `?${queryString}` : ''}`);
    };

    const openEmailFromKeyboard = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!deleteDialogOpen) {
                openEmail();
            }
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            onKeyboardDelete(email);
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            onKeyboardNavigate(index, 1);
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            onKeyboardNavigate(index, -1);
        }
    };

    const handleRowClick = (event) => {
        event.currentTarget.focus();
        const now = Date.now();
        const isDoubleActivation = event.detail > 1 || (now - lastRowTapAt.current <= DOUBLE_TAP_MS);
        lastRowTapAt.current = now;

        if (isDoubleActivation && !deleteDialogOpen) {
            openEmail();
            return;
        }

        onRowSelect(email, index, event);
    };

    const handleReadSummary = (event) => {
        event.stopPropagation();
        onReadSummary?.(email);
    };

    const handleArchiveToggle = (event) => {
        event.stopPropagation();
        onArchiveToggle?.(email);
    };

    const archiveIconName = isArchiveView ? 'unarchive' : 'archive';
    const showArchiveButton = Boolean(onArchiveToggle);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleRowClick}
            onKeyDown={openEmailFromKeyboard}
            data-email-row-id={email._id}
            aria-selected={isHighlighted}
            className={`group flex w-full items-stretch gap-0 border-b border-slate-100 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200 ${
                isDraft
                    ? isHighlighted ? 'bg-green-100/80 hover:bg-green-100' : 'bg-green-50/80 hover:bg-green-50'
                    : isHighlighted
                        ? 'bg-blue-50/90 hover:bg-blue-50/40'
                        : rowTone === 'muted'
                            ? 'bg-slate-50/70 hover:bg-blue-50/40'
                            : 'bg-white hover:bg-blue-50/40'
            }`}
        >
            <div
                className="flex min-h-[4.75rem] w-11 shrink-0 items-center justify-center px-3 py-3 sm:min-h-[4.25rem]"
                onClick={handleCheckboxClick}
                title={isChecked ? 'Uncheck' : 'Check'}
            >
                <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
            </div>

            {showArchiveButton && (
                <button
                    type="button"
                    onClick={handleArchiveToggle}
                    className="flex min-h-[4.75rem] shrink-0 items-center px-1 text-slate-400 opacity-70 transition hover:text-blue-600 hover:opacity-100 focus:opacity-100 focus:outline-none sm:min-h-[4.25rem]"
                    aria-label={archiveActionLabel}
                    title={archiveActionLabel}
                >
                    <MailshotIcon name={archiveIconName} size={20} />
                </button>
            )}

            {readSummaryEnabled && (
                <button
                    type="button"
                    onClick={handleReadSummary}
                    onContextMenu={onReadSummaryContextMenu}
                    disabled={readSummaryLoading}
                    title={readSummaryLoading ? 'Preparing read summary' : readAloudReady ? 'Read summary (ready)' : 'Read summary'}
                    aria-label="Read summary"
                    className={`flex min-h-[4.75rem] shrink-0 items-center px-1 transition disabled:cursor-wait disabled:opacity-75 sm:min-h-[4.25rem] ${
                        readAloudReady ? 'hover:text-green-600' : 'hover:text-blue-600'
                    }`}
                >
                    {readSummaryLoading ? (
                        <MailshotIcon name="refresh" size={20} active />
                    ) : (
                        <MailshotIcon name="headphones" size={20} />
                    )}
                </button>
            )}

            <button
                type="button"
                onClick={toggleStarredEmail}
                className="flex min-h-[4.75rem] shrink-0 items-center px-1 text-slate-400 transition hover:text-amber-500 sm:min-h-[4.25rem]"
                aria-label={email.starred ? 'Unstar' : 'Star'}
            >
                <MailshotIcon name="star" size={20} className={email.starred ? '' : 'grayscale opacity-55'} />
            </button>

            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-2.5">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <div className="flex min-w-0 items-center overflow-hidden text-sm leading-5 sm:shrink-0">
                            <span
                                className={`flex min-w-0 w-full max-w-full items-center gap-1 overflow-hidden whitespace-nowrap sm:w-[var(--mail-sender-width)] ${unread ? 'font-semibold text-slate-950' : 'font-medium text-slate-700'}`}
                                style={{ '--mail-sender-width': `${senderColumnWidthCh || 14}ch` }}
                                title={senderSource || senderName}
                            >
                                {visibleSenderContacts.length ? visibleSenderContacts.map((contact, contactIndex) => (
                                    <span key={`${contact.email}-${contactIndex}`} className="inline-flex min-w-0 items-center">
                                        {contactIndex > 0 && <span className="mr-1 text-slate-400">,</span>}
                                        <span className="min-w-0 truncate" title={contact.raw || contact.email || contact.label}>
                                            {contact.label}
                                        </span>
                                    </span>
                                )) : senderName}
                                {hiddenSenderCount > 0 && (
                                    <span className="shrink-0 text-xs font-medium text-slate-500">+{hiddenSenderCount}</span>
                                )}
                            </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm leading-5 sm:flex-1">
                            <span className={`min-w-0 shrink truncate ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                                {isDraft && (
                                    <span className="mr-1.5 inline-flex rounded-full bg-green-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200">
                                        Draft
                                    </span>
                                )}
                                {subject}
                            </span>
                            {email.thread_count > 1 && (
                                <span className="shrink-0 text-xs font-medium text-slate-500">
                                    ({email.thread_count})
                                </span>
                            )}
                            {hasAttachments && <MailshotIcon name="attach" size={18} />}
                            {snippet && (
                                <>
                                    <span className="hidden shrink-0 text-slate-300 sm:inline">-</span>
                                    <MarqueePreview>{snippet}</MarqueePreview>
                                </>
                            )}
                        </div>
                    </div>

                    {(email.labels || []).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                            {(email.labels || []).slice(0, 2).map((label) => (
                                <span
                                    key={label}
                                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                                >
                                    {getLabelDisplayName(label, labelNameMap)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="mt-0.5 flex shrink-0 items-center justify-end gap-1 text-right text-xs leading-4 text-slate-500 sm:gap-1.5">
                    <div>
                        <div className="whitespace-nowrap">{dateParts.date}</div>
                        <div className="whitespace-nowrap text-slate-400">{dateParts.time}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Email;
