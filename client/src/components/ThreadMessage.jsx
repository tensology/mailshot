import { emptyProfilePic } from '../constants/constant';
import { parseSenderEmail, parseSenderName } from '../utils/emailFormatter';
import QuotedContent from './common/QuotedContent';

const ThreadMessage = ({ message, isLatest = false }) => {
    const senderName = parseSenderName(message.from);
    const senderEmail = parseSenderEmail(message.from);

    return (
        <article className={`border-t py-5 first:border-t-0 ${isLatest ? 'rounded-xl border border-green-200 bg-green-50/35 px-3 shadow-sm shadow-green-100/60' : 'border-slate-100'}`}>
            <div className="mx-auto flex w-fit max-w-full gap-3">
                <img
                    src={emptyProfilePic}
                    alt=""
                    className="mt-1 h-10 w-10 shrink-0 rounded-full bg-slate-100"
                />
                <div className="min-w-0 max-w-full">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                                {senderName}
                                <span className="ml-2 break-all text-xs font-normal text-slate-500">
                                    &lt;{senderEmail}&gt;
                                </span>
                            </p>
                            <p className="break-words text-xs text-slate-500">
                                to {message.to}
                                {message.cc ? `, cc ${message.cc}` : ''}
                            </p>
                        </div>
                        <time className="text-xs text-slate-500">
                            {isLatest && (
                                <span className="mb-1 inline-flex rounded-full border border-green-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-green-700">
                                    Latest
                                </span>
                            )}
                            <span className="block">{new Date(message.date).toLocaleString()}</span>
                        </time>
                    </div>

                    <div className="mt-3 inline-block max-w-full align-top">
                        <QuotedContent body={message.body} bodyHtml={message.body_html} />
                    </div>
                </div>
            </div>
        </article>
    );
};

export default ThreadMessage;
