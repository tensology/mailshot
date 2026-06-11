import { Paperclip, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import { formatListPreview, parseSenderName, formatEmailDate } from '../utils/emailFormatter';
import { markEmailReadInCache } from '../utils/emailListCache';
import { getLabelDisplayName } from '../utils/labels';

const Email = ({ email, setStarredEmail, selectedEmails, setSelectedEmails, labelNameMap }) => {
    const toggleStarredEmailService = useApi(API_URLS.toggleStarredMails);
    const navigate = useNavigate();
    const { type } = useParams();

    const senderName = email.type === 'sent'
        ? parseSenderName(email.to)
        : parseSenderName(email.from);
    const subject = email?.subject || '(no subject)';
    const snippet = formatListPreview(email, 120);
    const hasAttachments = Array.isArray(email.attachments) && email.attachments.length > 0;
    const unread = !email.read;
    const isSelected = selectedEmails.includes(email._id);

    const toggleStarredEmail = async (event) => {
        event.stopPropagation();
        await toggleStarredEmailService.call({ id: email._id, value: !email.starred });
        setStarredEmail((prevState) => !prevState);
    };

    const handleChange = (event) => {
        event.stopPropagation();
        if (isSelected) {
            setSelectedEmails((prevState) => prevState.filter((id) => id !== email._id));
        } else {
            setSelectedEmails((prevState) => [...prevState, email._id]);
        }
    };

    const openEmail = () => {
        if (!email.read) {
            markEmailReadInCache(email._id);
        }
        navigate(`${routes.emails.path}/${type || 'inbox'}/${email._id}`);
    };

    const openEmailFromKeyboard = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openEmail();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={openEmail}
            onKeyDown={openEmailFromKeyboard}
            className={`group flex w-full items-start gap-2 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50 sm:items-center sm:gap-3 sm:px-4 ${
                unread ? 'bg-white' : 'bg-slate-50/60'
            }`}
        >
            <input
                type="checkbox"
                checked={isSelected}
                onClick={(event) => event.stopPropagation()}
                onChange={handleChange}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 sm:mt-0"
            />

            <button
                type="button"
                onClick={toggleStarredEmail}
                className="mt-0.5 shrink-0 text-slate-400 transition hover:text-amber-500 sm:mt-0"
                aria-label={email.starred ? 'Unstar' : 'Star'}
            >
                <Star className={`h-4 w-4 ${email.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            <div className="min-w-0 flex-1">
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
