import Email from "../model/email.js";
import Label from '../model/label.js';
import { sendMail } from '../services/mailer.js';
import {
    getCachedEmails,
    findEmailRecord,
    updateCachedEmail,
    deleteCachedEmails,
    syncMailboxNow,
    upsertCachedEmail,
    buildEmailFilter,
    buildStableSentId,
    getThreadForEmail,
    suppressMessageId,
    saveMailboxCacheToDisk
} from '../services/mail-sync.js';
import { isDbConnected } from '../database/db.js';
import { readAttachmentFile, saveAttachmentFromBuffer } from '../services/attachments.js';
import { deleteCachedLabelBySlug } from '../services/label-store.js';
import { compactEmailsBySubject, findEmailsBySubject, mergeThreadEmails } from '../utils/thread-subject.js';
import {
    getReadAloudAudioPath,
    getReadAloudJob,
    startReadAloudJob
} from '../services/read-aloud-service.js';
import { getCachedLabels } from '../services/label-store.js';

const MAIL_TYPES = new Set(['inbox', 'starred', 'sent', 'drafts', 'bin', 'spam', 'allmail', 'archived']);
const COUNT_MAIL_TYPES = ['inbox', 'starred', 'sent', 'drafts', 'bin', 'spam', 'allmail', 'archived'];
const RESERVED_SYSTEM_LABELS = new Set(['archived', 'archive', 'spam']);
let cachedTaxonomyRecalibrated = false;
let dbTaxonomyRecalibrated = false;

const serializeEmail = (email) => {
    if (!email) return null;
    const plain = email.toObject ? email.toObject() : email;
    return {
        ...plain,
        _id: String(plain._id)
    };
};

const removeReservedLabels = (labels = []) => (
    Array.isArray(labels) ? labels.filter((label) => !RESERVED_SYSTEM_LABELS.has(String(label).toLowerCase())) : []
);

const applyFalseOrMissingFilter = (dbFilter, fields = []) => {
    const andConditions = Array.isArray(dbFilter.$and) ? [...dbFilter.$and] : [];

    fields.forEach((field) => {
        if (dbFilter[field] !== false) {
            return;
        }

        delete dbFilter[field];
        andConditions.push({ $or: [{ [field]: false }, { [field]: { $exists: false } }] });
    });

    if (andConditions.length) {
        dbFilter.$and = andConditions;
    }
};

const buildDbFilter = (filter = {}) => {
    const dbFilter = { ...filter };
    delete dbFilter.label;
    delete dbFilter.search;
    delete dbFilter.participant;

    if (filter.in_inbox) {
        delete dbFilter.in_inbox;
        dbFilter.$and = [
            ...(dbFilter.$and || []),
            { $or: [{ in_inbox: true }, { in_inbox: { $exists: false } }] }
        ];
    }

    applyFalseOrMissingFilter(dbFilter, ['bin', 'archived', 'spam']);

    if (filter.label) {
        dbFilter.labels = filter.label;
    }

    return dbFilter;
};

const recalibrateMailTaxonomy = async () => {
    try {
        if (!cachedTaxonomyRecalibrated) {
            cachedTaxonomyRecalibrated = true;
            getCachedEmails().forEach((email) => {
                const labels = Array.isArray(email.labels) ? email.labels : [];
                const slugs = labels.map((label) => String(label).toLowerCase());
                const updates = {
                    labels: removeReservedLabels(labels)
                };

                if (slugs.includes('archived') || slugs.includes('archive')) {
                    updates.archived = true;
                    updates.in_inbox = false;
                }
                if (slugs.includes('spam')) {
                    updates.spam = true;
                    updates.in_inbox = false;
                    updates.archived = false;
                }

                if (updates.labels.length !== labels.length || updates.archived !== undefined || updates.spam !== undefined) {
                    updateCachedEmail(email._id, updates);
                }
            });
            deleteCachedLabelBySlug('archived');
            deleteCachedLabelBySlug('archive');
            deleteCachedLabelBySlug('spam');
            saveMailboxCacheToDisk();
        }

        if (isDbConnected() && !dbTaxonomyRecalibrated) {
            dbTaxonomyRecalibrated = true;
            const readMessageIds = getCachedEmails()
                .filter((email) => email.read === true && email.messageId)
                .map((email) => email.messageId);

            if (readMessageIds.length > 0) {
                await Email.updateMany(
                    { messageId: { $in: readMessageIds }, read: false },
                    { $set: { read: true } }
                );
            }

            await Email.updateMany(
                { labels: { $in: ['archived', 'archive'] } },
                { $set: { archived: true, in_inbox: false }, $pull: { labels: { $in: ['archived', 'archive'] } } }
            );
            await Email.updateMany(
                { labels: 'spam' },
                { $set: { spam: true, in_inbox: false, archived: false }, $pull: { labels: 'spam' } }
            );
            await Label.deleteMany({ slug: { $in: ['archived', 'archive', 'spam'] } });
        }
    } catch (error) {
        console.error('Mail taxonomy recalibration failed:', error.message);
    }
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

const hasDraftContent = (payload = {}) => (
    ['to', 'cc', 'bcc', 'subject', 'body'].some((field) => String(payload[field] || '').trim())
);

const normalizeDraftPayload = (payload = {}) => {
    const now = new Date();
    const draftId = payload._id || payload.id || '';

    return {
        ...(draftId ? { _id: draftId } : {}),
        to: String(payload.to || ''),
        cc: String(payload.cc || ''),
        bcc: String(payload.bcc || ''),
        from: String(payload.from || process.env.MAIL_FROM || process.env.MAILBOX_USER || ''),
        subject: String(payload.subject || ''),
        body: String(payload.body || ''),
        body_html: String(payload.body_html || ''),
        date: payload.date || now,
        image: payload.image || '',
        name: String(payload.name || process.env.MAILBOX_USER || process.env.MAIL_FROM || ''),
        starred: Boolean(payload.starred),
        bin: false,
        archived: false,
        spam: false,
        in_inbox: false,
        read: true,
        type: 'drafts',
        labels: [],
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        in_reply_to: payload.in_reply_to || payload.inReplyTo || '',
        references: Array.isArray(payload.references) ? payload.references : []
    };
};

export const saveDraftEmail = async (request, response) => {
    try {
        if (!hasDraftContent(request.body)) {
            return response.status(200).json(null);
        }

        const payload = normalizeDraftPayload(request.body);
        const draftId = payload._id;
        const existing = draftId ? await findEmailRecord(draftId) : null;
        const { _id: ignoredDraftId, ...draftUpdates } = payload;
        let savedDraft;

        if (existing?.source === 'cache') {
            savedDraft = updateCachedEmail(draftId, payload);
            saveMailboxCacheToDisk();
            return response.status(200).json(serializeEmail(savedDraft));
        }

        if (existing?.source === 'db' && isDbConnected()) {
            await Email.updateOne({ _id: draftId }, { $set: draftUpdates });
            const updated = await Email.findById(draftId);
            return response.status(200).json(serializeEmail(updated));
        }

        if (isDbConnected()) {
            const created = await Email.create(draftUpdates);
            return response.status(200).json(serializeEmail(created));
        }

        savedDraft = upsertCachedEmail(payload);
        saveMailboxCacheToDisk();
        return response.status(200).json(serializeEmail(savedDraft));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const getEmails = async (request, response) => {
    try {
        await recalibrateMailTaxonomy();
        let emails = [];
        const filter = buildEmailFilter(request.params.type, request.query);

        const dbConnected = isDbConnected();
        let dbQueryFailed = false;
        if (dbConnected) {
            try {
                const dbFilter = buildDbFilter(filter);

                emails = await Email.find(dbFilter).sort({ date: -1 });

                if (filter.search) {
                    const search = filter.search.toLowerCase();
                    emails = emails.filter((item) => {
                        const haystack = [item.subject, item.body, item.from, item.to].join(' ').toLowerCase();
                        return haystack.includes(search);
                    });
                }

                if (filter.participant) {
                    const participant = String(filter.participant).toLowerCase();
                    emails = emails.filter((item) => {
                        const haystack = [item.from, item.to, item.cc].join(' ').toLowerCase();
                        return haystack.includes(participant);
                    });
                }
            } catch (error) {
                dbQueryFailed = true;
                console.error('Database query failed, using cache:', error.message);
            }
        }

        if (!dbConnected || dbQueryFailed) {
            emails = getCachedEmails(filter);
        }

        const shouldCompact = request.params.type !== 'drafts';
        const listEmails = shouldCompact ? compactEmailsBySubject(emails) : emails;

        const page = Math.max(1, Number(request.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
        const total = listEmails.length;
        const offset = (page - 1) * limit;
        const paginated = listEmails.slice(offset, offset + limit);

        response.status(200).json({
            emails: paginated.map(serializeEmail),
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const getMailboxCounts = async (_, response) => {
    try {
        await recalibrateMailTaxonomy();

        const systemUnread = {};
        const labelUnread = {};

        if (isDbConnected()) {
            await Promise.all(COUNT_MAIL_TYPES.map(async (type) => {
                const filter = buildDbFilter({ ...buildEmailFilter(type), read: false });
                systemUnread[type] = await Email.countDocuments(filter);
            }));

            const labels = await Label.find().select('slug').lean();

            await Promise.all(labels.map(async (label) => {
                const filter = buildDbFilter({ label: label.slug, read: false, bin: false, spam: false });
                labelUnread[label.slug] = await Email.countDocuments(filter);
            }));

            return response.status(200).json({
                inbox_unread: systemUnread.inbox || 0,
                system_unread: systemUnread,
                label_unread: labelUnread
            });
        }

        COUNT_MAIL_TYPES.forEach((type) => {
            systemUnread[type] = getCachedEmails({
                ...buildEmailFilter(type),
                read: false
            }).length;
        });

        getCachedLabels().forEach((label) => {
            labelUnread[label.slug] = getCachedEmails({
                label: label.slug,
                read: false,
                bin: false,
                spam: false
            }).length;
        });

        return response.status(200).json({
            inbox_unread: systemUnread.inbox || 0,
            system_unread: systemUnread,
            label_unread: labelUnread
        });
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const searchEmails = async (request, response) => {
    try {
        const query = String(request.query.q || '').trim();
        if (!query) {
            return response.status(200).json([]);
        }

        const page = Math.max(1, Number(request.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));

        let emails = [];
        if (isDbConnected()) {
            emails = await Email.find({
                $text: { $search: query }
            }).sort({ date: -1 });
        } else {
            emails = getCachedEmails({ search: query });
        }

        const listEmails = compactEmailsBySubject(emails);
        const total = listEmails.length;
        const offset = (page - 1) * limit;
        const paginated = listEmails.slice(offset, offset + limit);

        return response.status(200).json({
            emails: paginated.map(serializeEmail),
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (error) {
        const emails = compactEmailsBySubject(getCachedEmails({ search: String(request.query.q || '').trim() }));
        const page = Math.max(1, Number(request.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
        const total = emails.length;
        const offset = (page - 1) * limit;
        response.status(200).json({
            emails: emails.slice(offset, offset + limit).map(serializeEmail),
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit))
        });
    }
};

const markThreadRead = async (thread, source) => {
    for (const item of thread) {
        const itemId = String(item._id);
        if (source === 'db') {
            await Email.updateOne({ _id: item._id }, { $set: { read: true } });
        } else {
            updateCachedEmail(itemId, { read: true });
        }
        item.read = true;
    }
};

const findDbThread = async (anchorEmail) => {
    const relatedIds = new Set(
        [anchorEmail.messageId, anchorEmail.in_reply_to, ...(anchorEmail.references || [])].filter(Boolean)
    );

    let expanded = true;
    while (expanded) {
        expanded = false;
        const matches = await Email.find({
            $or: [
                { messageId: { $in: [...relatedIds] } },
                { in_reply_to: { $in: [...relatedIds] } },
                { references: { $in: [...relatedIds] } }
            ]
        });

        for (const item of matches) {
            if (item.messageId && !relatedIds.has(item.messageId)) {
                relatedIds.add(item.messageId);
                (item.references || []).forEach((ref) => relatedIds.add(ref));
                expanded = true;
            }
        }
    }

    const idThread = await Email.find({ messageId: { $in: [...relatedIds] } }).sort({ date: 1 });
    const subjectCandidates = await Email.find({ subject: { $exists: true, $ne: '' } });
    const subjectThread = findEmailsBySubject(subjectCandidates, anchorEmail);

    return mergeThreadEmails(anchorEmail, idThread, subjectThread);
};

export const getEmailThread = async (request, response) => {
    try {
        const resolved = await findEmailRecord(request.params.id);
        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        const { email, source } = resolved;
        let thread = [];

        if (source === 'cache') {
            thread = getThreadForEmail(email);
        } else if (isDbConnected()) {
            thread = await findDbThread(email);
        }

        if (!thread.length) {
            thread = [email];
        }

        await markThreadRead(thread, source);
        response.status(200).json(thread.map(serializeEmail));
    } catch (error) {
        response.status(500).json(error.message);
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

export const startEmailReadAloud = async (request, response) => {
    try {
        const resolved = await findEmailRecord(request.params.id);
        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        const job = await startReadAloudJob(resolved.email);
        return response.status(200).json(job);
    } catch (error) {
        return response.status(500).json(error.message || 'Could not start read aloud');
    }
};

export const getEmailReadAloudJob = async (request, response) => {
    const job = getReadAloudJob(request.params.jobId);
    if (!job) {
        return response.status(404).json('Read aloud job not found');
    }
    return response.status(200).json(job);
};

export const streamReadAloudAudio = async (request, response) => {
    const audioPath = getReadAloudAudioPath(request.params.filename);
    if (!audioPath) {
        return response.status(404).json('Audio not found');
    }

    response.setHeader('Content-Type', 'audio/ogg');
    response.setHeader('Cache-Control', 'private, max-age=7200');
    return response.sendFile(audioPath);
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
            saveMailboxCacheToDisk();
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
                if (resolved.email.messageId) {
                    suppressMessageId(resolved.email.messageId);
                }
                deleteCachedEmails([id]);
            } else {
                if (resolved.email.messageId) {
                    suppressMessageId(resolved.email.messageId);
                }
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
                updateCachedEmail(id, { bin: true, spam: false, starred: false, type: '', archived: false });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                { $set: { bin: true, spam: false, starred: false, type: '', archived: false }}
            );
        }

        response.status(201).json('emails moved to bin');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const markEmailsAsSpam = async (request, response) => {
    try {
        const ids = Array.isArray(request.body) ? request.body : [];
        const dbIds = [];

        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }

            if (resolved.source === 'cache') {
                updateCachedEmail(id, {
                    spam: true,
                    in_inbox: false,
                    archived: false,
                    bin: false,
                    starred: false,
                    labels: removeReservedLabels(resolved.email.labels)
                });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                {
                    $set: { spam: true, in_inbox: false, archived: false, bin: false, starred: false },
                    $pull: { labels: { $in: ['spam', 'archived', 'archive'] } }
                }
            );
        }

        saveMailboxCacheToDisk();
        response.status(200).json('emails marked as spam');
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
                updateCachedEmail(id, {
                    archived: true,
                    in_inbox: false,
                    spam: false,
                    bin: false,
                    starred: false,
                    labels: removeReservedLabels(resolved.email.labels)
                });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                {
                    $set: { archived: true, in_inbox: false, spam: false, bin: false, starred: false },
                    $pull: { labels: { $in: ['archived', 'archive', 'spam'] } }
                }
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
            cc: request.body.cc || '',
            bcc: request.body.bcc || '',
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
