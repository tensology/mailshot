// Server-side signature append for integration-API draft creation and sends.
// Mirrors client/src/utils/signatureComposer.js (applySignatureHtml): signature goes after the
// editable body, before any data-mailshot-quoted block, separated by <br> (or <br><br> if empty).
// Idempotent: never appends when the body already contains the signature.
import { getSettings } from './settings-store.js';

const SIZING = ['width:490px', 'max-width:100%', 'height:auto', 'display:block'];
const normalizeImg = (tag = '') => {
    const out = tag.replace(/\sstyle=(["'])(.*?)\1/i, (m, q, style) => {
        const kept = style.split(';').map((d) => d.trim()).filter(Boolean)
            .filter((d) => !['width', 'max-width', 'height', 'display'].includes(String(d.split(':')[0] || '').trim().toLowerCase()));
        return ` style=${q}${[...kept, ...SIZING].join(';')};${q}`;
    });
    return out === tag ? tag.replace(/\s*\/?>(\s*)$/, ` style="${SIZING.join(';')};">$1`) : out;
};
export const normalizeSignatureHtml = (html = '') => String(html || '').trim().replace(/<img\b[^>]*>/gi, normalizeImg);

export const htmlToPlainText = (html = '') => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();

const squash = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const extractEmail = (v) => (String(v || '').match(/[^\s<>"',;]+@[^\s<>"',;]+/) || [''])[0].toLowerCase();

/** Signature for the sender: exact address match, or the selected default when no `from` given. */
export const resolveSignature = (general = {}, from = '') => {
    const entries = (Array.isArray(general.signatures) && general.signatures.length)
        ? general.signatures
        : [{ email: general.selected_email || general.email, signature_html: general.signature_html || '' }];
    const wanted = extractEmail(from) || String(general.selected_email || general.email || entries[0]?.email || '').trim().toLowerCase();
    const entry = entries.find((e) => String(e?.email || '').trim().toLowerCase() === wanted);
    const html = normalizeSignatureHtml(entry?.signature_html || '');
    const text = htmlToPlainText(html);
    return html || text ? { html, text } : null;
};

export const appendSignatureHtml = (bodyHtml = '', sigHtml = '') => {
    const source = String(bodyHtml || '');
    if (!sigHtml || squash(source).includes(squash(sigHtml))) return source;
    if (squash(htmlToPlainText(source)).includes(squash(htmlToPlainText(sigHtml))) && squash(htmlToPlainText(sigHtml))) return source;
    const qi = source.search(/<(?:blockquote|div)\b[^>]*data-mailshot-quoted=["']?true/i);
    const editable = (qi < 0 ? source : source.slice(0, qi)).trim();
    const quoted = qi < 0 ? '' : source.slice(qi);
    return `${editable}${editable ? '<br>' : '<br><br>'}${sigHtml}${quoted}`;
};

export const appendSignatureText = (bodyText = '', sigText = '') => {
    const source = String(bodyText || '');
    if (!sigText || squash(source).includes(squash(sigText))) return source;
    const trimmed = source.replace(/\s+$/, '');
    return trimmed ? `${trimmed}\n\n${sigText}` : sigText;
};

export const isSignatureOptOut = (payload = {}) => payload.signature === false
    || ['false', '0', 'no', 'off'].includes(String(payload.signature ?? '').toLowerCase())
    || payload.include_signature === false;

/** Returns { text, html } with the signature appended where missing. Parts that are empty stay empty
 *  unless both are empty (then text gets it). */
export const applySignatureToParts = ({ text = '', html = '' } = {}, sig) => {
    if (!sig) return { text, html };
    const hasHtml = Boolean(String(html || '').trim());
    const hasText = Boolean(String(text || '').trim());
    const nextHtml = hasHtml && sig.html ? appendSignatureHtml(html, sig.html) : html;
    const nextText = (hasText || !hasHtml) && sig.text ? appendSignatureText(text, sig.text) : text;
    return { text: nextText, html: nextHtml };
};

export const createSignatureApplier = ({ loadSettings = getSettings } = {}) => async (payload = {}, { text = '', html = '' } = {}) => {
    if (isSignatureOptOut(payload)) return { text, html };
    let general = {};
    try { general = (await loadSettings())?.general || {}; } catch { return { text, html }; }
    return applySignatureToParts({ text, html }, resolveSignature(general, payload.from));
};
export const applySenderSignature = createSignatureApplier();
