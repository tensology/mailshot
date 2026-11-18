import { useState } from 'react';
import { splitPlainQuotedContent, splitHtmlQuotedContent } from '../../utils/quoteSplitter';
import { formatEmailBody, extractHtmlBody } from '../../utils/emailFormatter';
import EmailHtml from './EmailHtml';
import IconButton from '../ui/IconButton';
import MailshotIcon from '../ui/MailshotIcon';

const QuotedContent = ({ body, bodyHtml }) => {
    const [expanded, setExpanded] = useState(false);

    const htmlSource = bodyHtml ? extractHtmlBody(bodyHtml) : '';
    const htmlParts = htmlSource ? splitHtmlQuotedContent(htmlSource) : { main: '', quoted: '' };
    const plainParts = splitPlainQuotedContent(formatEmailBody(body));

    const hasHtmlQuote = Boolean(htmlParts.quoted?.replace(/<[^>]+>/g, '').trim());
    const hasPlainQuote = Boolean(plainParts.quoted?.trim());
    const hasQuote = hasHtmlQuote || hasPlainQuote;

    const mainHtml = htmlParts.main;
    const quotedHtml = htmlParts.quoted;

    const showHtml = mainHtml && (mainHtml.replace(/<[^>]+>/g, '').trim() || /<img\b/i.test(mainHtml));

    return (
        <div className="mailshot-email-content w-full min-w-0 max-w-full text-left text-sm leading-6 text-slate-800 dark:text-slate-100 [overflow-wrap:anywhere]">
            {showHtml ? (
                <EmailHtml html={mainHtml} originalHtml={bodyHtml} />
            ) : (
                <p className="whitespace-pre-wrap">{plainParts.main || 'No message body available.'}</p>
            )}

            {hasQuote && (
                <div className="mt-4">
                    {!expanded ? (
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm transition hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300"
                            onClick={() => setExpanded(true)}
                        >
                            <MailshotIcon name="chevron-down" size={18} />
                            View folded message
                        </button>
                    ) : (
                        <div className="mt-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/70 p-3 text-slate-600 dark:text-slate-300">
                            <IconButton
                                label="Hide folded message"
                                size="sm"
                                className="mb-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                onClick={() => setExpanded(false)}
                            >
                                <MailshotIcon name="chevron-up" size={20} />
                            </IconButton>
                            {quotedHtml && quotedHtml.replace(/<[^>]+>/g, '').trim() ? (
                                <EmailHtml html={quotedHtml} originalHtml={bodyHtml} title="Folded email message" />
                            ) : (
                                <p className="whitespace-pre-wrap text-sm">{plainParts.quoted}</p>
                            )}
                            <button
                                type="button"
                                className="mt-3 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm transition hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-700 dark:hover:text-blue-300"
                                onClick={() => setExpanded(false)}
                            >
                                Collapse folded message
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default QuotedContent;
