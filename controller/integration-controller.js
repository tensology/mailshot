import { getEmailById, getEmails, saveDraftEmail, sendEmail } from './email-controller.js';
import { runIdempotent } from '../services/integration-idempotency.js';

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

export const listMessages = async (request, response) => {
    const folder = String(request.query.folder || 'inbox').toLowerCase();
    const allowed = new Set(['inbox', 'sent', 'drafts', 'archived', 'spam', 'bin', 'starred', 'allmail']);
    if (!allowed.has(folder)) return response.status(400).json({ error: { code: 'invalid_folder', message: 'Unknown mail folder' } });
    return envelope(response, await invoke(getEmails, { ...request, params: { type: folder } }));
};

export const getMessage = async (request, response) => envelope(
    response,
    await invoke(getEmailById, { ...request, params: { id: request.params.id } })
);

export const listDrafts = async (request, response) => envelope(
    response,
    await invoke(getEmails, { ...request, params: { type: 'drafts' } })
);

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
