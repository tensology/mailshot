import express from 'express';

import {
    deleteDraft,
    deleteMessage,
    getMessage,
    listDrafts,
    listLabels,
    listMessages,
    listSenders,
    saveDraft,
    searchMessages,
    sendMessage,
    updateMessageLabels,
    updateMessageState
} from '../controller/integration-controller.js';
import { downloadAttachment } from '../controller/email-controller.js';
import { requireMailStateScope, requireReadScope, requireScope, requireTensologyService } from '../services/tensology-service-auth.js';

const routes = express.Router();
routes.use(requireTensologyService);
routes.get('/messages', requireReadScope, listMessages);
routes.get('/search', requireReadScope, searchMessages);
routes.get('/labels', requireReadScope, listLabels);
routes.get('/senders', requireReadScope, listSenders);
routes.get('/messages/:id', requireReadScope, getMessage);
routes.get('/messages/:id/attachments/:attachmentId', requireReadScope, downloadAttachment);
routes.patch('/messages/:id/state', requireMailStateScope, updateMessageState);
routes.put('/messages/:id/labels', requireScope('mail.manage'), updateMessageLabels);
routes.delete('/messages/:id', requireScope('mail.manage'), deleteMessage);
routes.get('/drafts', requireReadScope, listDrafts);
routes.get('/drafts/:id', requireReadScope, getMessage);
routes.get('/drafts/:id/attachments/:attachmentId', requireReadScope, downloadAttachment);
routes.post('/drafts', requireScope('mail.drafts.write'), saveDraft);
routes.patch('/drafts/:id', requireScope('mail.drafts.write'), saveDraft);
routes.delete('/drafts/:id', requireScope('mail.drafts.write'), deleteDraft);
routes.post('/send', requireScope('mail.send'), sendMessage);

export default routes;
