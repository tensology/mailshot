import DOMPurify from 'dompurify';

export const COMPOSE_ALLOWED_TAGS = [
    'a', 'b', 'br', 'caption', 'col', 'colgroup', 'div', 'em', 'i', 'img', 'li', 'ol', 'p',
    'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
];

export const sanitizeComposeHtml = (html = '') => DOMPurify.sanitize(String(html || ''), {
    ADD_ATTR: ['style', 'target', 'rel'],
    ALLOWED_TAGS: COMPOSE_ALLOWED_TAGS
});
