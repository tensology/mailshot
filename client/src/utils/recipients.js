import { parseSenderEmail } from './emailFormatter';

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
