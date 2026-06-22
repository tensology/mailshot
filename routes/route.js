import express from 'express';
import multer from 'multer';

import {
    saveSendEmails,
    saveDraftEmail,
    getEmails,
    getEmailById,
    getEmailThread,
    searchEmails,
    downloadAttachment,
    toggleStarredEmail,
    toggleReadEmail,
    deleteEmails,
    moveEmailsToBin,
    restoreEmailsFromBin,
    markEmailsAsSpam,
    archiveEmails,
    sendEmail,
    syncMailbox,
    getMailboxCounts,
    startEmailReadAloud,
    getEmailReadAloudJob,
    streamReadAloudAudio,
    startSummarizeAllEmails,
    getSummarizeAllStatus,
    isMailTypeRoute
} from '../controller/email-controller.js';

import {
    getLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    updateEmailLabels,
    getEmailLabels,
    moveEmailsToLabel,
    listLabelRules,
    createLabelRule
} from '../controller/label-controller.js';

import {
    getContacts,
    getContactById,
    createContact,
    updateContact,
    deleteContact
} from '../controller/contact-controller.js';

import {
    login,
    logout,
    getCurrentSession,
    getAuthStatus
} from '../controller/auth-controller.js';

import {
    getAppSettings,
    updateGeneralSettings,
    updateAiSettings,
    updateTtsSettings,
    fetchAiModels
} from '../controller/settings-controller.js';

import { requireAuth } from '../middleware/auth.js';

const routes = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

routes.get('/auth/status', getAuthStatus);
routes.post('/auth/login', login);
routes.get('/auth/me', getCurrentSession);
routes.post('/auth/logout', logout);

routes.use(requireAuth);

routes.post('/save', saveSendEmails);
routes.post('/send', upload.array('attachments', 10), sendEmail);
routes.post('/save-draft', saveDraftEmail);
routes.get('/emails/search', searchEmails);
routes.get('/email/:id/attachments/:attachmentId', downloadAttachment);
routes.post('/email/:id/read-aloud', startEmailReadAloud);
routes.get('/read-aloud/audio/:filename', streamReadAloudAudio);
routes.get('/read-aloud/:jobId', getEmailReadAloudJob);
routes.post('/emails/summarize-all', startSummarizeAllEmails);
routes.get('/emails/summarize-all/status', getSummarizeAllStatus);
routes.get('/email/:id/labels', getEmailLabels);
routes.post('/email/:id/labels', updateEmailLabels);
routes.get('/email/:id/thread', getEmailThread);
routes.get('/email/:id', getEmailById);
routes.get('/emails/counts', getMailboxCounts);
routes.get('/emails/:type', (request, response, next) => {
    if (!isMailTypeRoute(request.params.type)) {
        return response.status(404).json('Unknown mailbox type');
    }
    return getEmails(request, response, next);
});
routes.post('/starred', toggleStarredEmail);
routes.post('/read', toggleReadEmail);
routes.delete('/delete', deleteEmails);
routes.post('/bin', moveEmailsToBin);
routes.post('/bin/restore', restoreEmailsFromBin);
routes.post('/spam', markEmailsAsSpam);
routes.post('/archive', archiveEmails);
routes.post('/move-to-label', moveEmailsToLabel);
routes.post('/sync', syncMailbox);

routes.get('/settings', getAppSettings);
routes.put('/settings/general', updateGeneralSettings);
routes.put('/settings/ai', updateAiSettings);
routes.put('/settings/tts', updateTtsSettings);
routes.post('/settings/ai/models', fetchAiModels);

routes.get('/labels', getLabels);
routes.post('/labels', createLabel);
routes.put('/labels/:id', updateLabel);
routes.delete('/labels/:id', deleteLabel);
routes.get('/label-rules', listLabelRules);
routes.post('/label-rules', createLabelRule);

routes.get('/contacts', getContacts);
routes.get('/contacts/:id', getContactById);
routes.post('/contacts', createContact);
routes.put('/contacts/:id', updateContact);
routes.delete('/contacts/:id', deleteContact);

export default routes;
