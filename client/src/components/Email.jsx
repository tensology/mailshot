import { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Star, Volume2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import { formatBodyPreview, formatEmailDateParts, parseSenderName } from '../utils/emailFormatter';
import { markEmailReadInCache } from '../utils/emailListCache';
import { getLabelDisplayName } from '../utils/labels';

const MARQUEE_SPEED_PX_PER_SECOND = 46;

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
        <span className="mailshot-marquee-viewport min-w-0 flex-1 text-slate-500">
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
    onRowSelect,
    onCheckboxSelect,
    onKeyboardDelete,
    onKeyboardNavigate,
    onOpenDraft,
    deleteDialogOpen
}) => {
    const toggleStarredEmailService = useApi(API_URLS.toggleStarredMails);
    const navigate = useNavigate();
    const { type } = useParams();
    const [searchParams] = useSearchParams();

    const isDraft = type === 'drafts' || email.type === 'drafts';
    const senderName = isDraft
        ? (email.to ? parseSenderName(email.to) : '(no recipient)')
        : email.type === 'sent'
            ? parseSenderName(email.to)
            : parseSenderName(email.from);
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
        navigate(`${routes.emails.path}/${type || 'inbox'}/${email._id}${queryString ? `?${queryString}` : ''}`);
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
        onRowSelect(email, index, event);
    };

    const handleReadSummary = (event) => {
        event.stopPropagation();
        onReadSummary?.(email);
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleRowClick}
            onDoubleClick={openEmail}
            onKeyDown={openEmailFromKeyboard}
            data-email-row-id={email._id}
            aria-selected={isHighlighted}
            className={`group flex w-full items-center gap-0 border-b border-slate-100 text-left transition hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200 ${
                isHighlighted ? 'bg-blue-50/90' : rowTone === 'muted' ? 'bg-slate-50/70' : 'bg-white'
            }`}
        >
            <div
                className="flex min-h-[4.25rem] w-11 shrink-0 items-center justify-center px-3 py-3"
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

            <button
                type="button"
                onClick={toggleStarredEmail}
                className="flex h-[4.25rem] shrink-0 items-center text-slate-400 transition hover:text-amber-500"
                aria-label={email.starred ? 'Unstar' : 'Star'}
            >
                <Star className={`h-4 w-4 ${email.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-3 px-3 py-2.5 sm:px-4">
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm leading-5">
                        <span
                            className={`shrink-0 whitespace-nowrap ${unread ? 'font-semibold text-slate-950' : 'font-medium text-slate-700'}`}
                            style={{ width: `${senderColumnWidthCh || 14}ch` }}
                        >
                            {senderName}
                        </span>
                        <span className={`shrink-0 whitespace-nowrap ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                            {isDraft && <span className="font-semibold text-red-600">Draft </span>}
                            {subject}
                        </span>
                        {email.thread_count > 1 && (
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                                ({email.thread_count})
                            </span>
                        )}
                        {hasAttachments && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        {snippet && (
                            <>
                                <span className="shrink-0 text-slate-300">-</span>
                                <MarqueePreview>{snippet}</MarqueePreview>
                            </>
                        )}
                        {readSummaryEnabled && (
                            <button
                                type="button"
                                onClick={handleReadSummary}
                                disabled={readSummaryLoading}
                                className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-sm transition disabled:cursor-wait disabled:opacity-75 ${
                                    readAloudReady
                                        ? 'border-green-300 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100'
                                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100'
                                }`}
                            >
                                {readSummaryLoading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Volume2 className="h-3.5 w-3.5" />
                                )}
                                <span>Read Summary</span>
                            </button>
                        )}
                    </div>

                    {(email.labels || []).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                            {(email.labels || []).slice(0, 2).map((label) => (
                                <span
                                    key={label}
                                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                >
                                    {getLabelDisplayName(label, labelNameMap)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="mt-0.5 shrink-0 text-right text-xs leading-4 text-slate-500">
                    <div className="whitespace-nowrap">{dateParts.date}</div>
                    <div className="whitespace-nowrap text-slate-400">{dateParts.time}</div>
                </div>
            </div>
        </div>
    );
};

export default Email;
