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
    saveMailboxCacheToDisk,
    moveEmailsToSpamMailbox,
    moveEmailsToInboxMailbox
} from '../services/mail-sync.js';
import { isDbConnected } from '../database/db.js';
import { deleteAttachmentFile, readAttachmentFile, saveAttachmentFromBuffer, buildContentDisposition } from '../services/attachments.js';
import { createZipArchive } from '../services/zip-archive.js';
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
import { assertOutboundSendAllowed } from '../services/rate-limit.js';

const MAIL_TYPES = new Set(['inbox', 'starred', 'sent', 'drafts', 'bin', 'spam', 'allmail', 'archived', 'everywhere']);
const COUNT_MAIL_TYPES = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'bin', 'spam', 'allmail', 'archived'];
const RESERVED_SYSTEM_LABELS = new Set(['archived', 'archive', 'spam']);
const MAX_OUTBOUND_BYTES = Number(process.env.MAIL_SEND_MAX_BYTES || 25 * 1024 * 1024);

const respondServerError = (response, error, fallback = 'Request failed') => {
    console.error(fallback, error?.message || error);
    return response.status(500).json(fallback);
};

const estimateOutboundBytes = ({ body = '', html = '', attachments = [] } = {}) => {
    const textBytes = Buffer.byteLength(String(html || body || ''), 'utf8');
    const attachmentBytes = (attachments || []).reduce((sum, item) => sum + Number(item.size || 0), 0);
    return textBytes + attachmentBytes;
};

const loadEmailsByIds = async (ids = []) => {
    const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
    if (!uniqueIds.length) {
        return [];
    }

    if (isMailboxStoreReady()) {
        const repository = getMailboxRepository();
        const emails = await Promise.all(uniqueIds.map((id) => repository.findById(id)));
        return emails.filter(Boolean);
    }

    const emails = [];
    for (const id of uniqueIds) {
        const resolved = await findEmailRecord(id);
        if (resolved?.email) {
            emails.push(resolved.email);
        }
    }
    return emails;
};
const SAFE_INLINE_ATTACHMENT_TYPES = new Set([
    'application/pdf',
    'image/bmp',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/ogg',
    'video/quicktime',
    'video/webm'
]);
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

const stripHtmlForPreview = (value = '') => String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

const buildEmailPreview = (email = {}, limit = 500) => {
    const preview = stripHtmlForPreview(email.preview || email.body_html || email.body || '');
    return preview.length > limit ? preview.slice(0, limit).trimEnd() : preview;
};

const serializeEmailListItem = (email) => {
    const plain = serializeEmail(email);
    if (!plain) return null;

    const {
        body,
        body_html,
        ...rest
    } = plain;

    return {
        ...rest,
        preview: buildEmailPreview(plain),
        attachments: Array.isArray(plain.attachments)
            ? plain.attachments.map(({ content, data, buffer, ...attachment }) => attachment)
            : []
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
            const haystack = [
                item.subject,
                item.body,
                item.body_html,
                item.from,
                item.to,
                item.cc,
                ...(item.attachments || []).map((attachment) => attachment.filename)
            ].join(' ').toLowerCase();
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
        respondServerError(response, error);
    }
};

const hasDraftContent = (payload = {}) => (
    ['to', 'cc', 'bcc', 'subject', 'body'].some((field) => String(payload[field] || '').trim())
);

export const parseForwardedAttachmentRefs = (value) => {
    if (!value) {
        return [];
    }

    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return (Array.isArray(parsed) ? parsed : [])
            .map((item) => ({
                emailId: String(item.emailId || item.email_id || '').trim(),
                attachmentId: String(item.attachmentId || item.attachment_id || '').trim()
            }))
            .filter((item) => item.emailId && item.attachmentId);
    } catch {
        return [];
    }
};

const parseJsonArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const findStoredEmail = async (emailId) => {
    if (isMailboxStoreReady()) {
        const repository = getMailboxRepository();
        return repository.findById(emailId);
    }

    const resolved = await findEmailRecord(emailId);
    return resolved?.email || null;
};

export const createSendAttachmentOwnership = ({ deleteFile = deleteAttachmentFile } = {}) => {
    const owned = [];
    let cleaned = false;
    return {
        trackCreated(attachment) {
            owned.push(attachment);
            return attachment;
        },
        cleanup() {
            if (cleaned) return;
            cleaned = true;
            owned.forEach((attachment) => deleteFile(attachment.storage_path));
        }
    };
};

export const copyForwardedAttachments = async (refs = [], ownership, {
    findEmail = findStoredEmail,
    readFile = readAttachmentFile,
    saveFile = saveAttachmentFromBuffer
} = {}) => {
    const copied = [];
    const seen = new Set();

    for (const ref of refs) {
        const key = `${ref.emailId}:${ref.attachmentId}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        const email = await findEmail(ref.emailId);
        const attachment = (email?.attachments || []).find((item) => (
            String(item.attachment_id || '') === ref.attachmentId
        ));
        if (!attachment) {
            continue;
        }

        const data = readFile(attachment.storage_path);
        if (!data) {
            throw new Error(`Attachment file missing: ${attachment.filename || 'attachment'}`);
        }

        const copy = saveFile(data, {
            filename: attachment.filename || 'attachment',
            content_type: attachment.content_type || 'application/octet-stream'
        });
        copied.push(ownership ? ownership.trackCreated(copy) : copy);
    }

    return copied;
};

const parseBoolean = (value) => value === true || value === 'true';

export const createUploadedAttachments = (files = [], ownership, {
    saveFile = saveAttachmentFromBuffer
} = {}) => (
    files.map((file) => {
        const attachment = saveFile(file.buffer, {
        filename: file.originalname,
        content_type: file.mimetype
        });
        return ownership ? ownership.trackCreated(attachment) : attachment;
    })
);

export const createRetainedAttachmentSendPlan = (attachments = [], {
    copyFiles = true,
    readFile = readAttachmentFile,
    saveFile = saveAttachmentFromBuffer,
    deleteFile = deleteAttachmentFile,
    ownership = createSendAttachmentOwnership({ deleteFile })
} = {}) => {
    if (!copyFiles) {
        return { attachments, cleanup: () => {} };
    }

    const copies = [];
    const cleanup = ownership.cleanup;

    try {
        attachments.forEach((attachment) => {
            const data = readFile(attachment.storage_path);
            if (!data) {
                throw new Error(`Attachment file missing: ${attachment.filename || 'attachment'}`);
            }
            copies.push(ownership.trackCreated(saveFile(data, {
                filename: attachment.filename || 'attachment',
                content_type: attachment.content_type || 'application/octet-stream'
            })));
        });
    } catch (error) {
        cleanup();
        throw error;
    }

    return { attachments: copies, cleanup };
};

export const runWithCleanupOnFailure = async (action, cleanup) => {
    try {
        return await action();
    } catch (error) {
        cleanup();
        throw error;
    }
};

const getRetainedAttachments = (existingEmail, retainedIds = [], selectionSpecified = false) => {
    const existingAttachments = Array.isArray(existingEmail?.attachments) ? existingEmail.attachments : [];
    if (!selectionSpecified) {
        return existingAttachments;
    }

    const retained = new Set(retainedIds.map((id) => String(id)));
    return existingAttachments.filter((attachment) => retained.has(String(attachment.attachment_id)));
};

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
        starred: parseBoolean(payload.starred),
        bin: false,
        archived: false,
        spam: false,
        in_inbox: false,
        read: true,
        type: 'drafts',
        labels: [],
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        in_reply_to: payload.in_reply_to || payload.inReplyTo || '',
        references: Array.isArray(payload.references) ? payload.references : parseJsonArray(payload.references),
        scheduled_send_at: payload.scheduled_send_at || payload.scheduledSendAt || null
    };
};

export const saveDraftEmail = async (request, response) => {
    try {
        const retainedSelectionSpecified = Object.prototype.hasOwnProperty.call(request.body, 'retained_attachments');
        const retainedAttachmentIds = parseJsonArray(request.body.retained_attachments);
        const uploadedFiles = request.files || [];
        if (!hasDraftContent(request.body) && !retainedAttachmentIds.length && !uploadedFiles.length) {
            return response.status(200).json(null);
        }

        const payload = normalizeDraftPayload(request.body);
        const draftId = payload._id;
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const existing = draftId ? await repository.findById(draftId) : null;
            payload.attachments = [
                ...getRetainedAttachments(existing, retainedAttachmentIds, retainedSelectionSpecified),
                ...createUploadedAttachments(uploadedFiles)
            ];
            const saved = await repository.upsert(payload);
            return response.status(200).json(serializeEmail(saved));
        }

        const existing = draftId ? await findEmailRecord(draftId) : null;
        const retainedAttachments = getRetainedAttachments(
            existing?.email || existing,
            retainedAttachmentIds,
            retainedSelectionSpecified
        );
        payload.attachments = [
            ...retainedAttachments,
            ...createUploadedAttachments(uploadedFiles)
        ];
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
        respondServerError(response, error);
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
                emails: paginated.map(serializeEmailListItem),
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
            emails: paginated.map(serializeEmailListItem),
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (error) {
        respondServerError(response, error);
    }
};

export const getMailboxCounts = async (_, response) => {
    try {
        await recalibrateMailTaxonomy();

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const systemUnread = {};

            await Promise.all(COUNT_MAIL_TYPES.map(async (type) => {
                systemUnread[type] = await repository.count({
                    ...buildEmailFilter(type),
                    read: false,
                    exclude_muted: true
                });
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
        return respondServerError(response, error);
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
            emails: paginated.map(serializeEmailListItem),
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (error) {
        respondServerError(response, error);
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
    if (typeof repository.findThread === 'function') {
        return repository.findThread(anchorEmail);
    }

    return [anchorEmail];
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
        respondServerError(response, error);
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
        respondServerError(response, error);
    }
};

export const downloadAttachment = async (request, response) => {
    try {
        let email = null;
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            email = await repository.findById(request.params.id);
        } else {
            const resolved = await findEmailRecord(request.params.id);
            email = resolved?.email || null;
        }

        if (!email) {
            return response.status(404).json('Email not found');
        }

        const attachment = (email.attachments || []).find((item) => item.attachment_id === request.params.attachmentId);
        if (!attachment) {
            return response.status(404).json('Attachment not found');
        }

        const fileBuffer = readAttachmentFile(attachment.storage_path);
        if (!fileBuffer) {
            return response.status(404).json('Attachment file missing');
        }

        const contentType = String(attachment.content_type || 'application/octet-stream').toLowerCase().split(';', 1)[0].trim();
        const disposition = request.query?.disposition === 'inline' && SAFE_INLINE_ATTACHMENT_TYPES.has(contentType)
            ? 'inline'
            : 'attachment';
        response.setHeader('Content-Type', contentType);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Disposition', buildContentDisposition(disposition, attachment.filename));
        response.send(fileBuffer);
    } catch (error) {
        respondServerError(response, error);
    }
};

export const downloadAllAttachments = async (request, response) => {
    try {
        let email = null;
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            email = await repository.findById(request.params.id);
        } else {
            const resolved = await findEmailRecord(request.params.id);
            email = resolved?.email || null;
        }

        if (!email) {
            return response.status(404).json('Email not found');
        }

        const files = (email.attachments || [])
            .map((attachment) => ({
                filename: attachment.filename || 'attachment',
                data: readAttachmentFile(attachment.storage_path)
            }))
            .filter((file) => file.data);

        if (!files.length) {
            return response.status(404).json('No attachments found');
        }

        const zip = createZipArchive(files);
        const safeSubject = String(email.subject || 'attachments').replace(/[^\w .()[\]-]/g, '_').slice(0, 80) || 'attachments';
        response.setHeader('Content-Type', 'application/zip');
        response.setHeader('Content-Disposition', buildContentDisposition('attachment', `${safeSubject}.zip`));
        response.send(zip);
    } catch (error) {
        respondServerError(response, error);
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
        return respondServerError(response, error, 'Could not start read aloud');
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
        return respondServerError(response, error, 'Could not start summarize all');
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
        respondServerError(response, error);
    }
};

export const toggleReadEmail = async (request, response) => {
    try {
        const body = request.body || {};
        const value = Boolean(body.value);
        const defaultType = body.scope?.type || 'inbox';
        const ids = body.id
            ? [String(body.id)]
            : await resolveBulkEmailSelection(body, defaultType);

        if (!ids.length) {
            return response.status(400).json('No emails selected');
        }

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            await repository.updateMany(ids, { read: value });
            return response.status(200).json({ message: 'Read state updated', count: ids.length });
        }

        const dbIds = [];
        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }
            if (resolved.source === 'cache') {
                updateCachedEmail(id, { read: value });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany({ _id: { $in: dbIds } }, { $set: { read: value } });
        }

        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'Read state updated', count: ids.length });
    } catch (error) {
        respondServerError(response, error);
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
        respondServerError(response, error);
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
        respondServerError(response, error);
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
        respondServerError(response, error);
    }
};

export const markEmailsAsSpam = async (request, response) => {
    try {
        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
        const emails = await loadEmailsByIds(ids);
        await moveEmailsToSpamMailbox(emails);

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            await repository.updateMany(ids, {
                spam: true,
                in_inbox: false,
                archived: false,
                bin: false,
                starred: false
            });
            return response.status(200).json({ message: 'emails marked as spam', count: ids.length });
        }

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
                    $set: {
                        spam: true,
                        in_inbox: false,
                        archived: false,
                        bin: false,
                        starred: false
                    },
                    $pull: { labels: { $in: ['spam', 'archived', 'archive'] } }
                }
            );
        }

        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'emails marked as spam', count: ids.length });
    } catch (error) {
        respondServerError(response, error);
    }
};

const parseUntilTimestamp = (value, fallbackHours = 24) => {
    if (value && Number.isNaN(Number(value))) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    }
    const hours = Number(value) > 0 ? Number(value) : fallbackHours;
    return new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
};

export const muteEmails = async (request, response) => {
    try {
        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
        const mutedUntil = parseUntilTimestamp(request.body.until || request.body.hours, 7 * 24);
        if (!isMailboxStoreReady()) {
            return response.status(503).json('Mailbox store unavailable');
        }
        await getMailboxRepository().updateMany(ids, { muted_until: mutedUntil, read: true });
        return response.status(200).json({ message: 'emails muted', count: ids.length, muted_until: mutedUntil });
    } catch (error) {
        respondServerError(response, error);
    }
};

export const snoozeEmails = async (request, response) => {
    try {
        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
        const snoozedUntil = parseUntilTimestamp(request.body.until || request.body.hours, 24);
        if (!isMailboxStoreReady()) {
            return response.status(503).json('Mailbox store unavailable');
        }
        await getMailboxRepository().updateMany(ids, { snoozed_until: snoozedUntil });
        return response.status(200).json({ message: 'emails snoozed', count: ids.length, snoozed_until: snoozedUntil });
    } catch (error) {
        respondServerError(response, error);
    }
};

export const wakeSnoozedEmails = async (request, response) => {
    try {
        const ids = await resolveBulkEmailSelection(request.body, 'snoozed');
        if (!isMailboxStoreReady()) {
            return response.status(503).json('Mailbox store unavailable');
        }
        await getMailboxRepository().updateMany(ids, { snoozed_until: null });
        return response.status(200).json({ message: 'emails woken', count: ids.length });
    } catch (error) {
        respondServerError(response, error);
    }
};

export const restoreEmailsFromSpam = async (request, response) => {
    try {
        const ids = await resolveBulkEmailSelection(request.body, 'spam');
        const emails = await loadEmailsByIds(ids);
        await moveEmailsToInboxMailbox(emails);

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            await repository.updateMany(ids, {
                spam: false,
                in_inbox: true,
                archived: false,
                bin: false
            });
            return response.status(200).json({ message: 'emails restored from spam', count: ids.length });
        }

        const dbIds = [];
        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }

            if (resolved.source === 'cache') {
                updateCachedEmail(id, {
                    spam: false,
                    in_inbox: true,
                    archived: false,
                    bin: false
                });
            } else {
                dbIds.push(id);
            }
        }

        if (dbIds.length > 0 && isDbConnected()) {
            await Email.updateMany(
                { _id: { $in: dbIds }},
                {
                    $set: {
                        spam: false,
                        in_inbox: true,
                        archived: false,
                        bin: false
                    },
                    $pull: { labels: { $in: ['spam'] } }
                }
            );
        }

        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'emails restored from spam', count: ids.length });
    } catch (error) {
        respondServerError(response, error);
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
        respondServerError(response, error);
    }
};

export const restoreArchivedEmails = async (request, response) => {
    try {
        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const ids = await resolveBulkEmailSelection(request.body, 'archived');
            await repository.updateMany(ids, {
                archived: false,
                in_inbox: true,
                spam: false,
                bin: false
            });
            return response.status(200).json({ message: 'emails unarchived', count: ids.length });
        }

        const ids = await resolveBulkEmailSelection(request.body, 'archived');
        const dbIds = [];

        for (const id of ids) {
            const resolved = await findEmailRecord(id);
            if (!resolved) {
                continue;
            }
            if (resolved.source === 'cache') {
                updateCachedEmail(id, {
                    archived: false,
                    in_inbox: true,
                    spam: false,
                    bin: false,
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
                    $set: { archived: false, in_inbox: true, spam: false, bin: false },
                    $pull: { labels: { $in: ['archived', 'archive', 'spam'] } }
                }
            );
        }

        saveMailboxCacheToDisk();
        response.status(200).json({ message: 'emails unarchived', count: ids.length });
    } catch (error) {
        respondServerError(response, error);
    }
};

export const sendEmail = async (request, response) => {
    const attachmentOwnership = createSendAttachmentOwnership();
    try {
        const mailboxStoreReady = isMailboxStoreReady();
        const draftId = request.body.draftId || '';
        const draftRecord = draftId ? await findStoredEmail(draftId) : null;
        const retainedSelectionSpecified = Object.prototype.hasOwnProperty.call(request.body, 'retained_attachments');
        const retainedAttachmentIds = parseJsonArray(request.body.retained_attachments);

        const rate = assertOutboundSendAllowed({
            actor: request.auth?.username || request.integration?.key_id || 'anonymous',
            to: request.body.to,
            cc: request.body.cc,
            bcc: request.body.bcc
        });
        if (!rate.ok) {
            if (rate.retry_after_ms) {
                response.setHeader('Retry-After', String(Math.ceil(rate.retry_after_ms / 1000)));
            }
            return response.status(rate.status || 429).json(rate.message);
        }

        const outgoingAttachments = await runWithCleanupOnFailure(async () => {
            const retained = createRetainedAttachmentSendPlan(getRetainedAttachments(
                draftRecord,
                retainedAttachmentIds,
                retainedSelectionSpecified
            ), { copyFiles: mailboxStoreReady, ownership: attachmentOwnership });
            const uploaded = createUploadedAttachments(request.files || [], attachmentOwnership);
            const forwarded = await copyForwardedAttachments(
                parseForwardedAttachmentRefs(request.body.forwardedAttachments),
                attachmentOwnership
            );
            return [...retained.attachments, ...uploaded, ...forwarded];
        }, attachmentOwnership.cleanup);

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
            attachments: outgoingAttachments
        };

        const outboundBytes = estimateOutboundBytes(payload);
        if (outboundBytes > MAX_OUTBOUND_BYTES) {
            attachmentOwnership.cleanup();
            return response.status(400).json(
                `Message is too large (${Math.round(outboundBytes / (1024 * 1024))}MB). Max is ${Math.round(MAX_OUTBOUND_BYTES / (1024 * 1024))}MB.`
            );
        }

        const info = await runWithCleanupOnFailure(
            () => sendMail(payload),
            attachmentOwnership.cleanup
        );

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
            attachments: outgoingAttachments
        };

        const deleteDraftIfNeeded = async () => {
            if (!draftId) {
                return;
            }
            try {
                if (mailboxStoreReady) {
                    await getMailboxRepository().deleteMany([draftId]);
                } else if (isDbConnected()) {
                    await Email.deleteOne({ _id: draftId });
                } else {
                    deleteCachedEmails([draftId]);
                }
            } catch (error) {
                console.error('Failed to delete draft after send:', error.message);
            }
        };

        if (mailboxStoreReady) {
            const repository = getMailboxRepository();
            const email = await runWithCleanupOnFailure(
                () => repository.upsert(savedMail),
                attachmentOwnership.cleanup
            );
            await deleteDraftIfNeeded();
            return response.status(200).json(serializeEmail(email));
        }

        if (isDbConnected()) {
            const email = new Email(savedMail);
            await runWithCleanupOnFailure(
                () => email.save(),
                attachmentOwnership.cleanup
            );
            await deleteDraftIfNeeded();
            return response.status(200).json(serializeEmail(email));
        }

        const cached = await runWithCleanupOnFailure(
            () => upsertCachedEmail({
                ...savedMail,
                _id: buildStableSentId(info.messageId)
            }),
            attachmentOwnership.cleanup
        );
        await deleteDraftIfNeeded();
        return response.status(200).json(serializeEmail(cached));
    } catch (error) {
        attachmentOwnership.cleanup();
        respondServerError(response, error, 'Could not send email');
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
        respondServerError(response, error);
    }
};

export const isMailTypeRoute = (value = '') => MAIL_TYPES.has(value);

export const __setMailboxStoreForTests = setMailboxStoreForTests;
