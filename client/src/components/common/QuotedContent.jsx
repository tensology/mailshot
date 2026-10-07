import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import DOMPurify from 'dompurify';
import { splitPlainQuotedContent, splitHtmlQuotedContent } from '../../utils/quoteSplitter';
import { formatEmailBody, extractHtmlBody } from '../../utils/emailFormatter';
import { forceLinksToOpenInNewTab } from '../../utils/htmlLinks';
import IconButton from '../ui/IconButton';

const QuotedContent = ({ body, bodyHtml }) => {
    const [expanded, setExpanded] = useState(false);

    const htmlSource = bodyHtml ? extractHtmlBody(bodyHtml) : '';
    const htmlParts = htmlSource ? splitHtmlQuotedContent(htmlSource) : { main: '', quoted: '' };
    const plainParts = splitPlainQuotedContent(formatEmailBody(body));

    const hasHtmlQuote = Boolean(htmlParts.quoted?.replace(/<[^>]+>/g, '').trim());
    const hasPlainQuote = Boolean(plainParts.quoted?.trim());
    const hasQuote = hasHtmlQuote || hasPlainQuote;

    const mainHtml = htmlParts.main
        ? forceLinksToOpenInNewTab(DOMPurify.sanitize(htmlParts.main, { ADD_ATTR: ['target', 'rel'] }))
        : '';
    const quotedHtml = htmlParts.quoted
        ? forceLinksToOpenInNewTab(DOMPurify.sanitize(htmlParts.quoted, { ADD_ATTR: ['target', 'rel'] }))
        : '';

    const showHtml = mainHtml && mainHtml.replace(/<[^>]+>/g, '').trim();

    return (
        <div className="mailshot-email-content inline-block w-auto max-w-full overflow-x-auto text-left text-sm leading-6 text-slate-800 [overflow-wrap:anywhere] [&_*]:max-w-full [&_a]:text-blue-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto">
            {showHtml ? (
                <div dangerouslySetInnerHTML={{ __html: mainHtml }} />
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
                            <ChevronDown className="h-3.5 w-3.5" />
                            View folded message
                        </button>
                    ) : (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-slate-600">
                            <IconButton
                                label="Hide folded message"
                                size="sm"
                                className="mb-2 rounded-xl border border-slate-200 bg-white"
                                onClick={() => setExpanded(false)}
                            >
                                <ChevronUp className="h-4 w-4" />
                            </IconButton>
                            {quotedHtml && quotedHtml.replace(/<[^>]+>/g, '').trim() ? (
                                <div dangerouslySetInnerHTML={{ __html: quotedHtml }} />
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
