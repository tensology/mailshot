import { emptyProfilePic } from '../constants/constant';
import { parseSenderEmail, parseSenderName } from '../utils/emailFormatter';
import QuotedContent from './common/QuotedContent';
import { getProfilePhoto } from '../utils/profilePhoto';

const ThreadMessage = ({ message, isLatest = false }) => {
    const senderName = parseSenderName(message.from);
    const senderEmail = parseSenderEmail(message.from);
    const isDraft = message.type === 'drafts';
    const frameClass = isDraft
        ? 'rounded-md border border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-950 px-3 shadow-sm shadow-green-100/60'
        : isLatest
            ? 'rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/70 px-3 shadow-sm shadow-blue-100/60'
            : 'border-slate-100 dark:border-slate-800';

    return (
        <article className={`border-t py-5 first:border-t-0 ${frameClass}`}>
            <div className="mx-auto grid w-full max-w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3">
                <img
                    src={getProfilePhoto(senderEmail) || emptyProfilePic}
                    alt=""
                    className="mt-1 h-10 w-10 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 object-cover object-center"
                />
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {senderName}
                            <span className="ml-2 break-all text-xs font-normal text-slate-500 dark:text-slate-400">
                                &lt;{senderEmail}&gt;
                            </span>
                        </p>
                        <p className="break-words text-xs text-slate-500 dark:text-slate-400">
                            to {message.to}
                            {message.cc ? `, cc ${message.cc}` : ''}
                        </p>
                    </div>
                    <time className="text-xs text-slate-500 dark:text-slate-400">
                        {isDraft && (
                            <span className="mb-1 inline-flex rounded-full border border-green-300 dark:border-green-600 bg-white dark:bg-slate-900 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300">
                                Draft
                            </span>
                        )}
                        {isLatest && !isDraft && (
                            <span className="mb-1 inline-flex rounded-full border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                Latest
                            </span>
                        )}
                        <span className="block">{new Date(message.date).toLocaleString()}</span>
                    </time>
                </div>

                <div className="col-span-2 mt-3 w-full min-w-0 max-w-full align-top sm:col-span-1 sm:col-start-2">
                    <QuotedContent body={message.body} bodyHtml={message.body_html} />
                </div>
            </div>
        </article>
    );
};

export default ThreadMessage;
