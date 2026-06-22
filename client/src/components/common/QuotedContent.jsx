import { useState } from 'react';
import { ChevronUp, MoreHorizontal } from 'lucide-react';
import DOMPurify from 'dompurify';
import { splitPlainQuotedContent, splitHtmlQuotedContent } from '../../utils/quoteSplitter';
import { formatEmailBody, extractHtmlBody } from '../../utils/emailFormatter';
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
        ? DOMPurify.sanitize(htmlParts.main, { ADD_ATTR: ['target', 'rel', 'style'], ADD_TAGS: ['style'] })
        : '';
    const quotedHtml = htmlParts.quoted
        ? DOMPurify.sanitize(htmlParts.quoted, { ADD_ATTR: ['target', 'rel', 'style'], ADD_TAGS: ['style'] })
        : '';

    const showHtml = mainHtml && mainHtml.replace(/<[^>]+>/g, '').trim();

    return (
        <div className="inline-block w-auto max-w-full overflow-x-auto text-left text-sm leading-6 text-slate-800 [overflow-wrap:anywhere] [&_*]:max-w-full [&_a]:text-blue-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
            {showHtml ? (
                <div dangerouslySetInnerHTML={{ __html: mainHtml }} />
            ) : (
                <p className="whitespace-pre-wrap">{plainParts.main || 'No message body available.'}</p>
            )}

            {hasQuote && (
                <div className="mt-3">
                    {!expanded ? (
                        <IconButton
                            label="Show quoted text"
                            size="sm"
                            className="rounded-xl border border-slate-200"
                            onClick={() => setExpanded(true)}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </IconButton>
                    ) : (
                        <div className="mt-2 border-l-2 border-slate-200 pl-3 text-slate-600">
                            <IconButton
                                label="Hide quoted text"
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
                                Collapse quoted text
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default QuotedContent;
