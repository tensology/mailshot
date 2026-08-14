import express from 'express';

import { getMessage, listDrafts, listMessages, saveDraft, sendMessage } from '../controller/integration-controller.js';
import { requireTensologyService } from '../services/tensology-service-auth.js';

const routes = express.Router();
routes.use(requireTensologyService);
routes.get('/messages', listMessages);
routes.get('/messages/:id', getMessage);
routes.get('/drafts', listDrafts);
routes.get('/drafts/:id', getMessage);
routes.post('/drafts', saveDraft);
routes.patch('/drafts/:id', saveDraft);
routes.post('/send', sendMessage);

export default routes;
