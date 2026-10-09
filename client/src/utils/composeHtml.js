import DOMPurify from 'dompurify';

export const COMPOSE_ALLOWED_TAGS = [
    'a', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'div', 'em', 'hr', 'i', 'img',
    'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
];

export const sanitizeComposeHtml = (html = '') => DOMPurify.sanitize(String(html || ''), {
    ADD_ATTR: ['style', 'target', 'rel', 'data-mailshot-quoted'],
    ALLOWED_TAGS: COMPOSE_ALLOWED_TAGS
});
