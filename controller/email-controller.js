import Email from "../model/email.js";
import { sendMail } from '../services/mailer.js';
import {
    getCachedEmails,
    findEmailRecord,
    updateCachedEmail,
    deleteCachedEmails,
    syncMailboxNow,
    upsertCachedEmail,
    buildEmailFilter,
    buildStableSentId
} from '../services/mail-sync.js';
import { isDbConnected } from '../database/db.js';
import { readAttachmentFile, saveAttachmentFromBuffer } from '../services/attachments.js';

const MAIL_TYPES = new Set(['inbox', 'starred', 'sent', 'drafts', 'bin', 'allmail', 'archived']);

const serializeEmail = (email) => {
    if (!email) return null;
    const plain = email.toObject ? email.toObject() : email;
    return {
        ...plain,
        _id: String(plain._id)
    };
};

export const saveSendEmails = async (request, response) => {
    try {
        const email = await new Email({
            ...request.body,
            read: true,
            labels: request.body.labels || [],
            attachments: request.body.attachments || []
        });
        await email.save();

        response.status(200).json('email saved successfully');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const getEmails = async (request, response) => {
    try {
        let emails = [];
        const filter = buildEmailFilter(request.params.type, request.query);

        const dbConnected = isDbConnected();
        if (dbConnected) {
            try {
                const dbFilter = { ...filter };
                delete dbFilter.label;
                delete dbFilter.search;

                if (filter.label) {
                    dbFilter.labels = filter.label;
                }

                emails = await Email.find(dbFilter).sort({ date: -1 });

                if (filter.search) {
                    const search = filter.search.toLowerCase();
                    emails = emails.filter((item) => {
                        const haystack = [item.subject, item.body, item.from, item.to].join(' ').toLowerCase();
                        return haystack.includes(search);
                    });
                }
            } catch (error) {
                console.error('Database query failed, using cache:', error.message);
            }
        }

        if (!dbConnected || !emails || emails.length === 0) {
            emails = getCachedEmails(filter);
        }

        response.status(200).json(emails.map(serializeEmail));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const searchEmails = async (request, response) => {
    try {
        const query = String(request.query.q || '').trim();
        if (!query) {
            return response.status(200).json([]);
        }

        if (isDbConnected()) {
            const emails = await Email.find({
                $text: { $search: query }
            }).sort({ date: -1 }).limit(50);
            return response.status(200).json(emails.map(serializeEmail));
        }

        const emails = getCachedEmails({ search: query });
        return response.status(200).json(emails.map(serializeEmail));
    } catch (error) {
        const emails = getCachedEmails({ search: String(request.query.q || '').trim() });
        response.status(200).json(emails.map(serializeEmail));
    }
};

export const getEmailById = async (request, response) => {
    try {
        const resolved = await findEmailRecord(request.params.id);
        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        const { email, source } = resolved;
        const emailId = String(email._id);

        if (source === 'db') {
            await Email.updateOne({ _id: email._id }, { $set: { read: true } });
        } else {
            updateCachedEmail(emailId, { read: true });
        }

        email.read = true;
        response.status(200).json(serializeEmail(email));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const downloadAttachment = async (request, response) => {
    try {
        const resolved = await findEmailRecord(request.params.id);
        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        const { email } = resolved;

        const attachment = (email.attachments || []).find((item) => item.attachment_id === request.params.attachmentId);
        if (!attachment) {
            return response.status(404).json('Attachment not found');
        }

        const fileBuffer = readAttachmentFile(attachment.storage_path);
        if (!fileBuffer) {
            return response.status(404).json('Attachment file missing');
        }

        response.setHeader('Content-Type', attachment.content_type || 'application/octet-stream');
        response.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
        response.send(fileBuffer);
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const toggleStarredEmail = async (request, response) => {
    try {
        const { id, value } = request.body;
        const resolved = await findEmailRecord(id);

        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        if (resolved.source === 'cache') {
            updateCachedEmail(id, { starred: value });
        } else {
            await Email.updateOne({ _id: id }, { $set: { starred: value }});
        }

        response.status(201).json('Value is updated');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const toggleReadEmail = async (request, response) => {
    try {
        const { id, value } = request.body;
        const resolved = await findEmailRecord(id);

        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        if (resolved.source === 'cache') {
            updateCachedEmail(id, { read: value });
        } else {
            await Email.updateOne({ _id: id }, { $set: { read: value }});
        }

        response.status(200).json('Read state updated');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const deleteEmails = async (request, response) => {
    try {
        const ids = Array.isArray(request.body) ? request.body : [];
        const dbIds = [];

        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }
            if (resolved.source === 'cache') {
                deleteCachedEmails([id]);
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.deleteMany({ _id: { $in: dbIds }});
        }

        response.status(200).json('emails deleted successfully');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const moveEmailsToBin = async (request, response) => {
    try {
        const ids = Array.isArray(request.body) ? request.body : [];
        const dbIds = [];

        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }
            if (resolved.source === 'cache') {
                updateCachedEmail(id, { bin: true, starred: false, type: '', archived: false });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                { $set: { bin: true, starred: false, type: '', archived: false }}
            );
        }

        response.status(201).json('emails moved to bin');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const archiveEmails = async (request, response) => {
    try {
        const ids = Array.isArray(request.body) ? request.body : [];
        const dbIds = [];

        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }
            if (resolved.source === 'cache') {
                updateCachedEmail(id, { archived: true, bin: false, starred: false });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                { $set: { archived: true, bin: false, starred: false }}
            );
        }

        response.status(200).json('emails archived');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const sendEmail = async (request, response) => {
    try {
        const uploadedAttachments = (request.files || []).map((file) => saveAttachmentFromBuffer(file.buffer, {
            filename: file.originalname,
            content_type: file.mimetype
        }));

        const payload = {
            to: request.body.to,
            subject: request.body.subject,
            body: request.body.body,
            html: request.body.html || '',
            inReplyTo: request.body.inReplyTo,
            references: request.body.references
                ? String(request.body.references).split(',').map((item) => item.trim()).filter(Boolean)
                : undefined,
            attachments: uploadedAttachments
        };

        const info = await sendMail(payload);

        const savedMail = {
            to: payload.to,
            from: process.env.MAIL_FROM || process.env.MAILBOX_USER || process.env.MAIL_USERNAME,
            subject: payload.subject,
            body: payload.body,
            body_html: payload.html,
            date: new Date(),
            image: '',
            name: process.env.MAIL_NAME || 'Me',
            starred: false,
            bin: false,
            archived: false,
            read: true,
            type: 'sent',
            messageId: info.messageId,
            in_reply_to: payload.inReplyTo || '',
            references: payload.references || [],
            labels: [],
            attachments: uploadedAttachments
        };

        if (isDbConnected()) {
            const email = new Email(savedMail);
            await email.save();
            return response.status(200).json(serializeEmail(email));
        }

        const cached = upsertCachedEmail({
            ...savedMail,
            _id: buildStableSentId(info.messageId)
        });
        return response.status(200).json(serializeEmail(cached));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

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
};

export const isMailTypeRoute = (value = '') => MAIL_TYPES.has(value);
