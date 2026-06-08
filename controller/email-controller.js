import Email from "../model/email.js";
import { sendMail } from '../services/mailer.js';
import { getCachedEmails, syncMailboxNow, upsertCachedEmail } from '../services/mail-sync.js';
import { isDbConnected } from '../database/db.js';

export const saveSendEmails = async (request, response) => {
    try {
        const email = await new Email(request.body);
        email.save();

        response.status(200).json('email saved successfully');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const getEmails = async (request, response) => {
    try {
        let emails = [];
        let filter = {};

        if (request.params.type === 'starred') {
            filter = { starred: true, bin: false };
        } else if (request.params.type === 'bin') {
            filter = { bin: true };
        } else if (request.params.type === 'allmail') {
            filter = {};
        } else if (request.params.type === 'inbox') {
            filter = { type: 'inbox', bin: false };
        } else {
            filter = { type: request.params.type };
        }

        const dbConnected = isDbConnected();
        if (dbConnected) {
            try {
                emails = await Email.find(filter).sort({ date: -1 });
            } catch (error) {
                console.error('Database query failed, using cache:', error.message);
            }
        }

        if (!dbConnected || !emails || emails.length === 0) {
            emails = getCachedEmails(filter);
        }

        response.status(200).json(emails);
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const toggleStarredEmail = async (request, response) => {
    try {
        const { id, value } = request.body;

        if (!isDbConnected()) {
            return response.status(200).json('Value is updated');
        }

        await Email.updateOne({ _id: id }, { $set: { starred: value }})
        response.status(201).json('Value is updated');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const deleteEmails = async (request, response) => {
    try {
        if (!isDbConnected()) {
            return response.status(200).json('emails deleted successfully');
        }

        await Email.deleteMany({ _id: { $in: request.body }})
        response.status(200).json('emails deleted successfully');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const moveEmailsToBin = async (request, response) => {
    try {
        if (!isDbConnected()) {
            return response.status(200).json('emails moved to bin');
        }

        await Email.updateMany({ _id: { $in: request.body }}, { $set: { bin: true, starred: false, type: '' }});
        response.status(201).json('emails moved to bin');
    } catch (error) {
        response.status(500).json(error.message);   
    }
}

export const sendEmail = async (request, response) => {
    try {
        const payload = {
            to: request.body.to,
            subject: request.body.subject,
            body: request.body.body,
            inReplyTo: request.body.inReplyTo,
            references: request.body.references
        };

        await sendMail(payload);

        const savedMail = {
            to: payload.to,
            from: process.env.MAIL_FROM || process.env.MAILBOX_USER || process.env.MAIL_USERNAME,
            subject: payload.subject,
            body: payload.body,
            date: new Date(),
            image: '',
            name: 'Me',
            starred: false,
            bin: false,
            type: 'sent'
        };

        if (isDbConnected()) {
            const email = new Email(savedMail);
            await email.save();
        } else {
            upsertCachedEmail({
                ...savedMail,
                _id: `sent-${Date.now()}-${Math.random().toString(16).slice(2)}`
            });
        }

        response.status(200).json('email sent and saved');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const syncMailbox = async (_, response) => {
    try {
        const result = await syncMailboxNow();
        if (result?.error) {
            console.error('Mailbox sync failed:', result);
        }

        response.status(200).json(result);
    } catch (error) {
        response.status(500).json(error.message);
    }
}
