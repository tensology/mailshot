import DOMPurify from 'dompurify';

export const COMPOSE_ALLOWED_TAGS = [
    'a', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'div', 'em', 'hr', 'i', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'style',
    'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
];

export const sanitizeComposeHtml = (html = '') => DOMPurify.sanitize(String(html || ''), {
    ADD_ATTR: ['style', 'target', 'rel', 'data-mailshot-quoted'],
    ALLOWED_TAGS: COMPOSE_ALLOWED_TAGS
});
