import { Paperclip, Star } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import { formatListPreview, parseSenderName, formatEmailDate } from '../utils/emailFormatter';
import { markEmailReadInCache } from '../utils/emailListCache';
import { getLabelDisplayName } from '../utils/labels';

const Email = ({
    email,
    index,
    setStarredEmail,
    checkedEmails,
    highlightedEmail,
    labelNameMap,
    onRowSelect,
    onCheckboxSelect,
    onKeyboardDelete,
    onKeyboardNavigate,
    deleteDialogOpen
}) => {
    const toggleStarredEmailService = useApi(API_URLS.toggleStarredMails);
    const navigate = useNavigate();
    const { type } = useParams();
    const [searchParams] = useSearchParams();

    const senderName = email.type === 'sent'
        ? parseSenderName(email.to)
        : parseSenderName(email.from);
    const subject = email?.subject || '(no subject)';
    const snippet = formatListPreview(email, 120);
    const hasAttachments = Array.isArray(email.attachments) && email.attachments.length > 0;
    const unread = !email.read;
    const isChecked = checkedEmails.includes(email._id);
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

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleRowClick}
            onDoubleClick={openEmail}
            onKeyDown={openEmailFromKeyboard}
            data-email-row-id={email._id}
            aria-selected={isHighlighted}
            className={`group flex w-full items-start gap-0 border-b border-slate-100 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200 sm:items-center ${
                isHighlighted ? 'bg-blue-50/80' : unread ? 'bg-white' : 'bg-slate-50/60'
            }`}
        >
            <div
                className="flex min-h-[4.5rem] w-11 shrink-0 items-start justify-center px-3 py-3 sm:items-center"
                onClick={handleCheckboxClick}
                title={isChecked ? 'Uncheck' : 'Check'}
            >
                <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 sm:mt-0"
                />
            </div>

            <button
                type="button"
                onClick={toggleStarredEmail}
                className="mt-3 shrink-0 text-slate-400 transition hover:text-amber-500 sm:mt-0"
                aria-label={email.starred ? 'Unstar' : 'Star'}
            >
                <Star className={`h-4 w-4 ${email.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            <div className="min-w-0 flex-1 px-3 py-3 sm:px-4">
                <div className="flex items-start justify-between gap-2 sm:items-center">
                    <p className={`truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                        {senderName}
                    </p>
                    <span className="shrink-0 text-xs text-slate-500">{formatEmailDate(email.date)}</span>
                </div>

                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                    <p className={`truncate text-sm ${unread ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
                        {subject}
                    </p>
                    {hasAttachments && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                </div>

                <p className="mt-1 line-clamp-2 text-sm text-slate-500 sm:line-clamp-1">
                    {snippet}
                </p>

                {(email.labels || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {(email.labels || []).slice(0, 3).map((label) => (
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
        </div>
    );
};

export default Email;
