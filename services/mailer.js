import nodemailer from 'nodemailer';
import fs from 'fs';

const getMailerConfig = () => ({
    host: process.env.MAIL_SMTP_HOST,
    port: Number(process.env.MAIL_SMTP_PORT || 587),
    secure: String(process.env.MAIL_SMTP_SECURE || 'false') === 'true',
    auth: {
        user: process.env.MAILBOX_USER || process.env.MAIL_USERNAME || process.env.MAIL_IMAP_USERNAME,
        pass: process.env.MAILBOX_PASSWORD || process.env.MAIL_PASSWORD || process.env.MAIL_IMAP_PASSWORD
    },
    tls: {
        rejectUnauthorized: String(process.env.MAIL_SMTP_REJECT_UNAUTHORIZED || 'true') === 'true'
    }
});

const getDefaultFrom = () => process.env.MAIL_FROM || process.env.MAILBOX_USER || process.env.MAIL_USERNAME || '';

export const sendMail = async ({
    to,
    cc = '',
    bcc = '',
    subject = '',
    body = '',
    html = '',
    inReplyTo,
    references,
    attachments = []
}) => {
    const config = getMailerConfig();
    if (!config.host || !config.auth.user || !config.auth.pass) {
        throw new Error('SMTP settings are not configured. Set MAIL_SMTP_HOST, MAILBOX_USER, MAILBOX_PASSWORD in .env.');
    }

    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
        tls: config.tls
    });

    const toValue = String(to || '').trim();
    if (!toValue) {
        throw new Error('Recipient is required.');
    }

    try {
        await transporter.verify();
    } catch (error) {
        throw new Error(`SMTP verification failed for ${config.host}:${config.port}. ${error.message}`);
    }

    const mailAttachments = attachments.map((item) => ({
        filename: item.filename,
        content: item.content || (item.storage_path ? fs.readFileSync(item.storage_path) : undefined),
        contentType: item.content_type
    })).filter((item) => item.content);

    const ccValue = String(cc || '').trim();
    const bccValue = String(bcc || '').trim();

    const info = await transporter.sendMail({
        from: getDefaultFrom(),
        to: toValue,
        cc: ccValue || undefined,
        bcc: bccValue || undefined,
        subject,
        text: body,
        html: html || undefined,
        inReplyTo,
        references,
        attachments: mailAttachments,
        envelope: {
            from: config.auth.user,
            to: [toValue, ccValue, bccValue].filter(Boolean).join(', ')
        }
    });

    return info;
};
