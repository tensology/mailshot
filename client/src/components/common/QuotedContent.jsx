import { useState } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { MoreHoriz } from '@mui/icons-material';
import DOMPurify from 'dompurify';
import { splitPlainQuotedContent, splitHtmlQuotedContent } from '../../utils/quoteSplitter';
import { formatEmailBody, extractHtmlBody } from '../../utils/emailFormatter';

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
        <Box>
            {showHtml ? (
                <Box dangerouslySetInnerHTML={{ __html: mainHtml }} />
            ) : (
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{plainParts.main || 'No message body available.'}</Typography>
            )}

            {hasQuote && (
                <Box sx={{ mt: 1.5 }}>
                    {!expanded ? (
                        <IconButton
                            size="small"
                            onClick={() => setExpanded(true)}
                            sx={{
                                border: '1px solid #dadce0',
                                borderRadius: '12px',
                                width: 36,
                                height: 20,
                                color: '#5f6368'
                            }}
                            aria-label="Show quoted text"
                        >
                            <MoreHoriz fontSize="small" />
                        </IconButton>
                    ) : (
                        <Box
                            sx={{
                                mt: 1,
                                pl: 2,
                                borderLeft: '2px solid #dadce0',
                                color: '#5f6368'
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{ cursor: 'pointer', color: '#1a73e8', display: 'block', mb: 1 }}
                                onClick={() => setExpanded(false)}
                            >
                                Hide quoted text
                            </Typography>
                            {quotedHtml && quotedHtml.replace(/<[^>]+>/g, '').trim() ? (
                                <Box dangerouslySetInnerHTML={{ __html: quotedHtml }} />
                            ) : (
                                <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
                                    {plainParts.quoted}
                                </Typography>
                            )}
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default QuotedContent;
