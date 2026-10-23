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
import { requireMailStateScope, requireScope, requireTensologyService } from '../services/tensology-service-auth.js';

const routes = express.Router();
routes.use(requireTensologyService);
routes.get('/messages', listMessages);
routes.get('/search', searchMessages);
routes.get('/labels', listLabels);
routes.get('/senders', listSenders);
routes.get('/messages/:id', getMessage);
routes.patch('/messages/:id/state', requireMailStateScope, updateMessageState);
routes.put('/messages/:id/labels', updateMessageLabels);
routes.delete('/messages/:id', deleteMessage);
routes.get('/drafts', listDrafts);
routes.get('/drafts/:id', getMessage);
routes.post('/drafts', saveDraft);
routes.patch('/drafts/:id', saveDraft);
routes.delete('/drafts/:id', deleteDraft);
routes.post('/send', requireScope('mail.send'), sendMessage);

export default routes;
