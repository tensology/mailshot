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
    startReadAloudJob,
    deleteReadAloudAssetsForEmails
} from '../services/read-aloud-service.js';
import {
    getBulkReadAloudStatus,
    startBulkReadAloudSummaries
} from '../services/email-summary-service.js';
import { isSuperUser } from '../services/settings-store.js';
import { getMailboxIndexAvailability } from '../services/mailbox-read-state.js';
import {
    getMailboxRepository,
    isMailboxStoreReady,
    __setMailboxStoreForTests as setMailboxStoreForTests
} from '../services/postgres-mailbox-store.js';

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

const filterDbEmailsInMemory = (emails = [], filter = {}) => {
    let result = emails;

    if (filter.search) {
        const search = String(filter.search).toLowerCase();
        result = result.filter((item) => {
            const haystack = [item.subject, item.body, item.from, item.to].join(' ').toLowerCase();
            return haystack.includes(search);
        });
    }

    if (filter.participant) {
        const participant = String(filter.participant).toLowerCase();
        result = result.filter((item) => {
            const haystack = [item.from, item.to, item.cc].join(' ').toLowerCase();
            return haystack.includes(participant);
        });
    }

    return result;
};

const normalizeBulkSelection = (body = {}, defaultType = 'inbox') => {
    if (Array.isArray(body)) {
        return { ids: body.map(String).filter(Boolean), scope: null };
    }

    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (ids.length) {
        return { ids, scope: null };
    }

    const scope = body.scope || body.selection?.scope || null;
    if (!scope || scope.all !== true) {
        return { ids: [], scope: null };
    }

    const type = MAIL_TYPES.has(scope.type) ? scope.type : defaultType;
    return {
        ids: [],
        scope: {
            type,
            label: scope.label || '',
            search: scope.search || '',
            participant: scope.participant || '',
            unread: Boolean(scope.unread)
        }
    };
};

export const resolveBulkEmailSelection = async (body = {}, defaultType = 'inbox') => {
    const selection = normalizeBulkSelection(body, defaultType);
    if (!selection.scope) {
        return selection.ids;
    }

    const query = {
        ...(selection.scope.label ? { label: selection.scope.label } : {}),
        ...(selection.scope.search ? { search: selection.scope.search } : {}),
        ...(selection.scope.participant ? { participant: selection.scope.participant } : {}),
        ...(selection.scope.unread ? { unread: 'true' } : {})
    };
    const filter = buildEmailFilter(selection.scope.type, query);

    if (isMailboxStoreReady()) {
        const repository = getMailboxRepository();
        const emails = await repository.list(filter);
        return emails.map((email) => String(email._id));
    }

    if (isDbConnected()) {
        const dbEmails = await Email.find(buildDbFilter(filter)).sort({ date: -1 });
        return filterDbEmailsInMemory(dbEmails, filter).map((email) => String(email._id));
    }

    return getCachedEmails(filter).map((email) => String(email._id));
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
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const email = await repository.upsert({
                ...request.body,
                read: true,
                labels: request.body.labels || [],
                attachments: request.body.attachments || []
            });
            return response.status(200).json(serializeEmail(email));
        }

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
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const saved = await repository.upsert(payload);
            return response.status(200).json(serializeEmail(saved));
        }

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

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            emails = await repository.list(filter);

            const shouldCompact = request.params.type !== 'drafts';
            const listEmails = shouldCompact ? compactEmailsBySubject(emails) : emails;
            const page = Math.max(1, Number(request.query.page) || 1);
            const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
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
        }

        const dbConnected = isDbConnected();
        let dbQueryFailed = false;
        if (dbConnected) {
            try {
                const dbFilter = buildDbFilter(filter);

                emails = filterDbEmailsInMemory(await Email.find(dbFilter).sort({ date: -1 }), filter);
            } catch (error) {
                dbQueryFailed = true;
                console.error('Database query failed, using cache:', error.message);
            }
        }

        const mailboxIndex = getMailboxIndexAvailability({ dbConnected, dbQueryFailed });
        if (!mailboxIndex.available) {
            return response.status(503).json(mailboxIndex.message);
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

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const systemUnread = {};

            await Promise.all(COUNT_MAIL_TYPES.map(async (type) => {
                systemUnread[type] = await repository.count({ ...buildEmailFilter(type), read: false });
            }));

            return response.status(200).json({
                inbox_unread: systemUnread.inbox || 0,
                system_unread: systemUnread,
                label_unread: {}
            });
        }

        const systemUnread = {};
        const labelUnread = {};
        const mailboxIndex = getMailboxIndexAvailability({
            dbConnected: isMailboxStoreReady() || isDbConnected(),
            dbQueryFailed: false
        });

        if (!mailboxIndex.available) {
            return response.status(503).json(mailboxIndex.message);
        }

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
        return response.status(503).json(mailboxIndex.message);
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
        const mailboxIndex = getMailboxIndexAvailability({
            dbConnected: isMailboxStoreReady() || isDbConnected(),
            dbQueryFailed: false
        });

        if (!mailboxIndex.available) {
            return response.status(503).json(mailboxIndex.message);
        }

        let emails = [];
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            emails = await repository.search(query);
        } else if (isDbConnected()) {
            emails = await Email.find({
                $text: { $search: query }
            }).sort({ date: -1 });
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
        response.status(500).json(error.message);
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

const findMailboxStoreThread = async (repository, anchorEmail) => {
    const allEmails = await repository.list({});
    const relatedIds = new Set(
        [anchorEmail.messageId, anchorEmail.in_reply_to, ...(anchorEmail.references || [])].filter(Boolean)
    );

    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const item of allEmails) {
            if (!item.messageId || relatedIds.has(item.messageId)) {
                continue;
            }

            const references = item.references || [];
            const matchesThread = relatedIds.has(item.in_reply_to)
                || references.some((ref) => relatedIds.has(ref));

            if (matchesThread) {
                relatedIds.add(item.messageId);
                references.forEach((ref) => relatedIds.add(ref));
                expanded = true;
            }
        }
    }

    const idThread = allEmails
        .filter((item) => item.messageId && relatedIds.has(item.messageId))
        .sort((left, right) => new Date(left.date) - new Date(right.date));

    const subjectThread = findEmailsBySubject(allEmails, anchorEmail);
    return mergeThreadEmails(anchorEmail, idThread, subjectThread);
};

export const getEmailThread = async (request, response) => {
    try {
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const email = await repository.findById(request.params.id);
            if (!email) {
                return response.status(404).json('Email not found');
            }

            let thread = await findMailboxStoreThread(repository, email);
            if (!thread.length) {
                thread = [email];
            }

            const ids = [...new Set(thread.map((item) => String(item._id)).filter(Boolean))];
            if (ids.length) {
                await repository.updateMany(ids, { read: true });
                thread = thread.map((item) => ({ ...item, read: true }));
            }

            return response.status(200).json(thread.map(serializeEmail));
        }

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
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const email = await repository.findById(request.params.id);
            if (!email) {
                return response.status(404).json('Email not found');
            }

            await repository.updateMany([request.params.id], { read: true });
            email.read = true;
            return response.status(200).json(serializeEmail(email));
        }

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
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const email = await repository.findById(request.params.id);
            if (!email) {
                return response.status(404).json('Email not found');
            }

            const job = await startReadAloudJob(email);
            return response.status(200).json(job);
        }

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
    response.setHeader('Cache-Control', 'private, max-age=604800');
    return response.sendFile(audioPath);
};

export const startSummarizeAllEmails = async (request, response) => {
    if (!isSuperUser(request.auth?.username)) {
        return response.status(403).json('Only the super user can summarize all mail');
    }

    try {
        const status = await startBulkReadAloudSummaries();
        return response.status(200).json(status);
    } catch (error) {
        return response.status(500).json(error.message || 'Could not start summarize all');
    }
};

export const getSummarizeAllStatus = async (request, response) => {
    if (!isSuperUser(request.auth?.username)) {
        return response.status(403).json('Only the super user can view summarize all status');
    }

    return response.status(200).json(getBulkReadAloudStatus());
};

export const toggleStarredEmail = async (request, response) => {
    try {
        const { id, value } = request.body;
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            await repository.updateMany([id], { starred: value });
            return response.status(201).json('Value is updated');
        }

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
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            await repository.updateMany([id], { read: value });
            return response.status(200).json('Read state updated');
        }

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
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const ids = await resolveBulkEmailSelection(request.body, 'inbox');
            const deleted = await repository.deleteMany(ids);
            deleteReadAloudAssetsForEmails(ids);
            return response.status(200).json({ message: 'emails deleted successfully', count: deleted });
        }

        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
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

        deleteReadAloudAssetsForEmails(ids);
        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'emails deleted successfully', count: ids.length });
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const moveEmailsToBin = async (request, response) => {
    try {
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const ids = await resolveBulkEmailSelection(request.body, 'inbox');
            await repository.updateMany(ids, { bin: true, spam: false, starred: false, type: '', archived: false });
            return response.status(201).json({ message: 'emails moved to bin', count: ids.length });
        }

        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
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

        saveMailboxCacheToDisk();
        response.status(201).json({ message: 'emails moved to bin', count: ids.length });
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const restoreEmailsFromBin = async (request, response) => {
    try {
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const ids = await resolveBulkEmailSelection(request.body, 'bin');
            await repository.updateMany(ids, {
                bin: false,
                spam: false,
                archived: false,
                in_inbox: true,
                type: 'inbox'
            });
            return response.status(200).json({ message: 'emails restored from bin', count: ids.length });
        }

        const ids = await resolveBulkEmailSelection(request.body, 'bin');
        const dbIds = [];

        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }

            if (resolved.source === 'cache') {
                updateCachedEmail(id, {
                    bin: false,
                    spam: false,
                    archived: false,
                    in_inbox: true,
                    type: 'inbox'
                });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                { $set: { bin: false, spam: false, archived: false, in_inbox: true, type: 'inbox' }}
            );
        }

        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'emails restored from bin', count: ids.length });
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const markEmailsAsSpam = async (request, response) => {
    try {
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const ids = await resolveBulkEmailSelection(request.body, 'inbox');
            await repository.updateMany(ids, {
                spam: true,
                in_inbox: false,
                archived: false,
                bin: false,
                starred: false
            });
            return response.status(200).json({ message: 'emails marked as spam', count: ids.length });
        }

        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
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
        response.status(200).json({ message: 'emails marked as spam', count: ids.length });
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const archiveEmails = async (request, response) => {
    try {
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const ids = await resolveBulkEmailSelection(request.body, 'inbox');
            await repository.updateMany(ids, {
                archived: true,
                in_inbox: false,
                spam: false,
                bin: false,
                starred: false
            });
            return response.status(200).json({ message: 'emails archived', count: ids.length });
        }

        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
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

        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'emails archived', count: ids.length });
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

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const email = await repository.upsert(savedMail);
            return response.status(200).json(serializeEmail(email));
        }

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

export const __setMailboxStoreForTests = setMailboxStoreForTests;
