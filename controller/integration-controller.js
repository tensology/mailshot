import { deleteEmails, getEmailById, getEmailThread, getEmails, moveEmailsToBin, saveDraftEmail, searchEmails, sendEmail } from './email-controller.js';
import { getLabels, updateEmailLabels } from './label-controller.js';
import { findEmailRecord } from '../services/mail-sync.js';
import { getMailboxRepository, isMailboxStoreReady } from '../services/postgres-mailbox-store.js';
import { runIdempotent } from '../services/integration-idempotency.js';
import {
    MESSAGE_STATE_UPDATES,
    recordMessageStateAudit,
    updateMessageStateWithAudit
} from '../services/integration-message-state.js';

const invoke = async (handler, request) => {
    let status = 200;
    let data = null;
    const response = {
        status(value) { status = value; return this; },
        json(value) { data = value; return this; },
        setHeader() { return this; },
        send(value) { data = value; return this; }
    };
    await handler(request, response);
    return { status, data };
};

const normalizeRecipients = (value) => Array.isArray(value) ? value.join(', ') : String(value || '');
const envelope = (response, result, meta = {}) => response.status(result.status).json({ data: result.data, error: null, meta });

const compactWhitespace = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const messageSummary = (message = {}) => ({
    _id: String(message._id || ''),
    messageId: message.messageId || '',
    type: message.type || '',
    subject: message.subject || '',
    from: message.from || '',
    to: message.to || '',
    cc: message.cc || '',
    date: message.date || null,
    name: message.name || '',
    read: Boolean(message.read),
    starred: Boolean(message.starred),
    archived: Boolean(message.archived),
    spam: Boolean(message.spam),
    in_inbox: message.in_inbox !== false,
    labels: Array.isArray(message.labels) ? message.labels : [],
    attachments: Array.isArray(message.attachments)
        ? message.attachments.map(({ filename, contentType, size, contentDisposition }) => ({
            filename, contentType, size, contentDisposition
        }))
        : [],
    thread_count: Number(message.thread_count || 1),
    preview: compactWhitespace(message.read_summary || message.body || message.body_html).slice(0, 500)
});

const compactMessageList = (result) => {
    const payload = result?.data;
    if (result.status >= 400 || !payload || !Array.isArray(payload.emails)) return result;
    return {
        ...result,
        data: {
            ...payload,
            emails: payload.emails.map(messageSummary)
        }
    };
};

export const __integrationSerializersForTests = { messageSummary, compactMessageList };

// Section aliases accepted by the integration API (`folder` or `section`).
const SECTION_ALIASES = Object.freeze({ incoming: 'inbox', received: 'inbox', outgoing: 'sent', draft: 'drafts', trash: 'bin', archive: 'archived', all: 'allmail' });
export const resolveSection = (query = {}) => {
    const raw = String(query.folder || query.section || 'inbox').trim().toLowerCase();
    return SECTION_ALIASES[raw] || raw;
};

export const listMessages = async (request, response) => {
    const folder = resolveSection(request.query);
    if (request.query.tag && !request.query.label) request.query.label = request.query.tag;
    const allowed = new Set(['inbox', 'sent', 'drafts', 'archived', 'spam', 'bin', 'starred', 'allmail']);
    if (!allowed.has(folder)) return response.status(400).json({ error: { code: 'invalid_folder', message: 'Unknown mail folder' } });
    const result = await invoke(getEmails, { ...request, params: { type: folder } });
    return envelope(response, compactMessageList(result));
};

export const createGetMessageHandler = ({
    getOne = getEmailById,
    getThread = getEmailThread
} = {}) => async (request, response) => {
    const includeThread = ['1', 'true', 'yes', 'thread'].includes(
        String(request.query?.include_thread || '').trim().toLowerCase()
    );
    return envelope(
        response,
        await invoke(includeThread ? getThread : getOne, {
            ...request,
            params: { id: request.params.id }
        })
    );
};

export const getMessage = createGetMessageHandler();

export const createMessageStateHandler = ({
    idempotent = runIdempotent,
    updateState = updateMessageStateWithAudit,
    recordAudit = recordMessageStateAudit
} = {}) => async (request, response) => {
    const messageId = String(request.params.id || '').trim();
    const action = String(request.body?.action || '').trim().toLowerCase();
    if (!Object.hasOwn(MESSAGE_STATE_UPDATES, action)) {
        await recordAudit(request, 'mail.message.state.invalid', messageId, 400, { requested_action: action });
        return response.status(400).json({
            error: {
                code: 'invalid_action',
                message: 'Action must be read, unread, archive, or unarchive.'
            }
        });
    }

    try {
        const record = await idempotent(request, `mail.message.state.${messageId}`, async () => {
            const state = await updateState(request, messageId, action);
            if (!state) {
                const error = new Error('Message not found');
                error.status = 404;
                throw error;
            }
            return {
                status: 200,
                data: {
                    id: String(state.id || messageId),
                    action,
                    read: Boolean(state.read),
                    archived: Boolean(state.archived),
                    in_inbox: state.in_inbox !== false
                }
            };
        });
        return envelope(response, record, { idempotent_replay: Boolean(record.replay) });
    } catch (error) {
        const status = error.status || 500;
        return response.status(status).json({
            error: {
                code: status === 404 ? 'not_found' : 'mail_state_failed',
                message: error.message || 'Could not change message state'
            }
        });
    }
};

export const updateMessageState = createMessageStateHandler();

export const listDrafts = async (request, response) => {
    const result = await invoke(getEmails, { ...request, params: { type: 'drafts' } });
    return envelope(response, compactMessageList(result));
};

export const saveDraft = async (request, response) => {
    try {
        const record = await runIdempotent(request, `mail.draft.${request.params.id || 'new'}`, async () => {
            const body = {
                ...request.body,
                ...(request.params.id ? { _id: request.params.id } : {}),
                to: normalizeRecipients(request.body.to),
                cc: normalizeRecipients(request.body.cc),
                bcc: normalizeRecipients(request.body.bcc),
                body: request.body.text ?? request.body.body ?? '',
                body_html: request.body.html ?? request.body.body_html ?? ''
            };
            const result = await invoke(saveDraftEmail, { ...request, body });
            if (result.status >= 400) {
                const error = new Error(typeof result.data === 'string' ? result.data : 'Could not save draft');
                error.status = result.status;
                throw error;
            }
            return result;
        });
        return envelope(response, record, { idempotent_replay: Boolean(record.replay) });
    } catch (error) {
        return response.status(error.status || 500).json({ error: { code: 'mail_draft_failed', message: error.message } });
    }
};

export const sendMessage = async (request, response) => {
    try {
        const record = await runIdempotent(request, 'mail.send', async () => {
            const body = {
                ...request.body,
                to: normalizeRecipients(request.body.to),
                cc: normalizeRecipients(request.body.cc),
                bcc: normalizeRecipients(request.body.bcc),
                body: request.body.text ?? request.body.body ?? '',
                html: request.body.html || ''
            };
            const result = await invoke(sendEmail, { ...request, body, files: [] });
            if (result.status >= 400) {
                const error = new Error(typeof result.data === 'string' ? result.data : 'Could not send mail');
                error.status = result.status;
                throw error;
            }
            return result;
        });
        return envelope(response, record, { idempotent_replay: Boolean(record.replay) });
    } catch (error) {
        return response.status(error.status || 500).json({ error: { code: 'mail_send_failed', message: error.message } });
    }
};

// ---------------------------------------------------------------------------
// Additive integration endpoints (2026-10-22): search, labels, delete.
// None of these send mail. Deletes only ever target the single id in the URL.
// ---------------------------------------------------------------------------

const errorBody = (code, message) => ({ error: { code, message } });

/** Look up one record without the read-marking side effect of getEmailById. */
export const createRecordLookup = ({
    storeReady = isMailboxStoreReady,
    repository = getMailboxRepository,
    findRecord = findEmailRecord
} = {}) => async (id) => {
    if (storeReady()) return (await repository().findById(String(id))) || null;
    const resolved = await findRecord(String(id));
    return resolved?.email || null;
};
const lookupRecord = createRecordLookup();

export const isDraftRecord = (record = {}) => String(record?.type || '').toLowerCase() === 'drafts';

export const searchMessages = async (request, response) => {
    const q = String(request.query.q || request.query.search || '').trim();
    if (!q) return response.status(400).json(errorBody('invalid_query', 'q is required'));
    const result = await invoke(searchEmails, { ...request, query: { ...request.query, q } });
    if (Array.isArray(result.data)) {
        return envelope(response, { ...result, data: { emails: result.data.map(__integrationSerializersForTests.messageSummary), total: result.data.length } });
    }
    return envelope(response, compactMessageList(result));
};

export const listLabels = async (request, response) => {
    const result = await invoke(getLabels, request);
    return envelope(response, result);
};

export const createLabelsHandler = ({ idempotent = runIdempotent, lookup = lookupRecord, update = updateEmailLabels } = {}) => async (request, response) => {
    const messageId = String(request.params.id || '').trim();
    const labels = request.body?.labels;
    if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) {
        return response.status(400).json(errorBody('invalid_labels', 'labels must be an array of label names/slugs'));
    }
    try {
        const record = await idempotent(request, `mail.message.labels.${messageId}`, async () => {
            if (!(await lookup(messageId))) {
                const error = new Error('Message not found'); error.status = 404; throw error;
            }
            const result = await invoke(update, { ...request, params: { id: messageId }, body: { labels } });
            if (result.status >= 400) {
                const error = new Error(typeof result.data === 'string' ? result.data : 'Could not update labels');
                error.status = result.status; throw error;
            }
            const data = result.data || {};
            return { status: 200, data: { id: messageId, labels: Array.isArray(data.labels) ? data.labels : labels } };
        });
        return envelope(response, record, { idempotent_replay: Boolean(record.replay) });
    } catch (error) {
        const status = error.status || 500;
        return response.status(status).json(errorBody(status === 404 ? 'not_found' : 'mail_labels_failed', error.message));
    }
};
export const updateMessageLabels = createLabelsHandler();

export const createDeleteDraftHandler = ({ idempotent = runIdempotent, lookup = lookupRecord, remove = deleteEmails } = {}) => async (request, response) => {
    const draftId = String(request.params.id || '').trim();
    try {
        const record = await idempotent(request, `mail.draft.delete.${draftId}`, async () => {
            const existing = await lookup(draftId);
            if (!existing) { const error = new Error('Draft not found'); error.status = 404; throw error; }
            if (!isDraftRecord(existing)) { const error = new Error('Only draft records can be deleted here'); error.status = 409; throw error; }
            const result = await invoke(remove, { ...request, body: { ids: [draftId] } });
            if (result.status >= 400) {
                const error = new Error(typeof result.data === 'string' ? result.data : 'Could not delete draft');
                error.status = result.status; throw error;
            }
            return { status: 200, data: { id: draftId, deleted: true } };
        });
        return envelope(response, record, { idempotent_replay: Boolean(record.replay) });
    } catch (error) {
        const status = error.status || 500;
        const code = status === 404 ? 'not_found' : status === 409 ? 'not_a_draft' : 'mail_draft_delete_failed';
        return response.status(status).json(errorBody(code, error.message));
    }
};
export const deleteDraft = createDeleteDraftHandler();

/**
 * DELETE /messages/:id moves one message to Bin (recoverable).
 * ?permanent=true permanently removes it, but only when it is already in Bin.
 */
export const createDeleteMessageHandler = ({ idempotent = runIdempotent, lookup = lookupRecord, toBin = moveEmailsToBin, remove = deleteEmails } = {}) => async (request, response) => {
    const messageId = String(request.params.id || '').trim();
    const permanent = String(request.query?.permanent || '').toLowerCase() === 'true';
    try {
        const record = await idempotent(request, `mail.message.delete.${permanent ? 'permanent' : 'bin'}.${messageId}`, async () => {
            const existing = await lookup(messageId);
            if (!existing) { const error = new Error('Message not found'); error.status = 404; throw error; }
            if (permanent && !existing.bin) {
                const error = new Error('Permanent delete is only allowed for messages already in Bin'); error.status = 409; throw error;
            }
            const result = await invoke(permanent ? remove : toBin, { ...request, body: { ids: [messageId] } });
            if (result.status >= 400) {
                const error = new Error(typeof result.data === 'string' ? result.data : 'Could not delete message');
                error.status = result.status; throw error;
            }
            return { status: 200, data: { id: messageId, deleted: permanent, bin: !permanent } };
        });
        return envelope(response, record, { idempotent_replay: Boolean(record.replay) });
    } catch (error) {
        const status = error.status || 500;
        const code = status === 404 ? 'not_found' : status === 409 ? 'not_in_bin' : 'mail_delete_failed';
        return response.status(status).json(errorBody(code, error.message));
    }
};
export const deleteMessage = createDeleteMessageHandler();
