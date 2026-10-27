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
        <div className="mailshot-email-content w-full min-w-0 max-w-full text-left text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">
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
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            onClick={() => setExpanded(true)}
                        >
                            <MailshotIcon name="chevron-down" size={18} />
                            View folded message
                        </button>
                    ) : (
                        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 text-slate-600">
                            <IconButton
                                label="Hide folded message"
                                size="sm"
                                className="mb-2 rounded-md border border-slate-200 bg-white"
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
                                className="mt-3 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
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
