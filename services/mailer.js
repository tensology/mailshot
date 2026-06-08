import nodemailer from 'nodemailer';

const getMailerConfig = () => ({
    host: process.env.MAIL_SMTP_HOST,
    port: Number(process.env.MAIL_SMTP_PORT || 587),
    secure: String(process.env.MAIL_SMTP_SECURE || 'false') === 'true',
    auth: {
        user: process.env.MAILBOX_USER || process.env.MAIL_USERNAME,
        pass: process.env.MAILBOX_PASSWORD || process.env.MAIL_PASSWORD
    }
});

const getDefaultFrom = () => process.env.MAIL_FROM || process.env.MAILBOX_USER || process.env.MAIL_USERNAME || '';

export const sendMail = async ({ to, subject = '', body = '', inReplyTo, references }) => {
    const config = getMailerConfig();
    if (!config.host || !config.auth.user || !config.auth.pass) {
        throw new Error('SMTP settings are not configured. Set MAIL_SMTP_HOST, MAILBOX_USER, MAILBOX_PASSWORD in .env.');
    }

    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth
    });

    const toValue = String(to || '').trim();
    if (!toValue) {
        throw new Error('Recipient is required.');
    }

    await transporter.sendMail({
        from: getDefaultFrom(),
        to: toValue,
        subject,
        text: body,
        inReplyTo,
        references
    });
};

