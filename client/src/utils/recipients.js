import { extractHtmlBody, parseSenderEmail } from './emailFormatter.js';

const escapeHtml = (value = '') => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const plainTextToHtml = (value = '') => escapeHtml(value).replace(/\r?\n/g, '<br>');

const originalMessageHtml = (email, plainBody) => (
    extractHtmlBody(email.body_html) || plainTextToHtml(plainBody || email.body || '')
);

export const splitRecipients = (value = '') => {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

export const uniqueRecipients = (values = []) => {
    const seen = new Set();
    const result = [];

    values.forEach((value) => {
        const email = parseSenderEmail(value).toLowerCase();
        if (!email || seen.has(email)) {
            return;
        }
        seen.add(email);
        result.push(value);
    });

    return result;
};

export const buildReplyRecipients = (email) => {
    if (email.type === 'sent') {
        return uniqueRecipients(splitRecipients(email.to));
    }

    return uniqueRecipients([email.from]);
};

export const buildReplyAllRecipients = (email, mailboxAddress = '') => {
    const self = parseSenderEmail(mailboxAddress).toLowerCase();
    const pool = uniqueRecipients([
        ...splitRecipients(email.from),
        ...splitRecipients(email.to),
        ...splitRecipients(email.cc)
    ]);

    if (!self) {
        return {
            to: pool.slice(0, 1).join(', '),
            cc: pool.slice(1).join(', ')
        };
    }

    const filtered = pool.filter((item) => parseSenderEmail(item).toLowerCase() !== self);
    if (!filtered.length) {
        return { to: pool[0] || '', cc: '' };
    }

    const primary = email.type === 'sent' ? filtered : filtered.filter((item) => parseSenderEmail(item) === parseSenderEmail(email.from));
    const toList = primary.length ? primary : [filtered[0]];
    const ccList = filtered.filter((item) => !toList.includes(item));

    return {
        to: toList.join(', '),
        cc: ccList.join(', ')
    };
};

export const buildForwardBody = (email, plainBody) => {
    const forwardedHeader = [
        '',
        '',
        '---------- Forwarded message ---------',
        `From: ${email.from}`,
        `Date: ${new Date(email.date).toLocaleString()}`,
        `Subject: ${email.subject || '(no subject)'}`,
        `To: ${email.to}`,
        email.cc ? `Cc: ${email.cc}` : null,
        '',
        plainBody
    ].filter(Boolean).join('\n');

    return forwardedHeader;
};

export const buildReplyBody = (email, plainBody) => {
    return `\n\nOn ${new Date(email.date).toLocaleString()}, ${email.from} wrote:\n${plainBody}`;
};

export const buildForwardHtml = (email, plainBody = '') => `
    <div><br></div><div><br></div>
    <div data-mailshot-quoted="true">
        <div>---------- Forwarded message ---------</div>
        <div><strong>From:</strong> ${escapeHtml(email.from)}</div>
        <div><strong>Date:</strong> ${escapeHtml(new Date(email.date).toLocaleString())}</div>
        <div><strong>Subject:</strong> ${escapeHtml(email.subject || '(no subject)')}</div>
        <div><strong>To:</strong> ${escapeHtml(email.to)}</div>
        ${email.cc ? `<div><strong>Cc:</strong> ${escapeHtml(email.cc)}</div>` : ''}
        <div><br></div>
        ${originalMessageHtml(email, plainBody)}
    </div>
`;

export const buildReplyHtml = (email, plainBody = '') => `
    <div><br></div><div><br></div>
    <blockquote data-mailshot-quoted="true" style="margin:0 0 0 0.8ex;border-left:1px solid #cbd5e1;padding-left:1ex">
        <div>On ${escapeHtml(new Date(email.date).toLocaleString())}, ${escapeHtml(email.from)} wrote:</div>
        ${originalMessageHtml(email, plainBody)}
    </blockquote>
`;
