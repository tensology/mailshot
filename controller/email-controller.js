import Email from "../model/email.js";
import { sendMail } from '../services/mailer.js';
import { syncMailboxNow } from '../services/mail-sync.js';

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
        let emails;

        if (request.params.type === 'starred') {
            emails = await Email.find({ starred: true, bin: false });
        } else if (request.params.type === 'bin') {
            emails = await Email.find({ bin: true })
        } else if (request.params.type === 'allmail') {
            emails = await Email.find({});
        } else if (request.params.type === 'inbox') {
            emails = await Email.find({ type: 'inbox', bin: false }).sort({ date: -1 });
        } else {
            emails = await Email.find({ type: request.params.type }).sort({ date: -1 });
        }

        response.status(200).json(emails);
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const toggleStarredEmail = async (request, response) => {
    try {   
        await Email.updateOne({ _id: request.body.id }, { $set: { starred: request.body.value }})
        response.status(201).json('Value is updated');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const deleteEmails = async (request, response) => {
    try {
        await Email.deleteMany({ _id: { $in: request.body }})
        response.status(200).json('emails deleted successfully');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const moveEmailsToBin = async (request, response) => {
    try {
        await Email.updateMany({ _id: { $in: request.body }}, { $set: { bin: true, starred: false, type: '' }});
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

        const email = new Email(savedMail);
        await email.save();

        response.status(200).json('email sent and saved');
    } catch (error) {
        response.status(500).json(error.message);
    }
}

export const syncMailbox = async (_, response) => {
    try {
        const result = await syncMailboxNow();
        response.status(200).json(result);
    } catch (error) {
        response.status(500).json(error.message);
    }
}
