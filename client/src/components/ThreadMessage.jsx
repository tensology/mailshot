import { emptyProfilePic } from '../constants/constant';
import { parseSenderEmail, parseSenderName } from '../utils/emailFormatter';
import QuotedContent from './common/QuotedContent';

const ThreadMessage = ({ message }) => {
    const senderName = parseSenderName(message.from);
    const senderEmail = parseSenderEmail(message.from);

    return (
        <article className="border-t border-slate-100 py-5 first:border-t-0">
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
                            {new Date(message.date).toLocaleString()}
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
