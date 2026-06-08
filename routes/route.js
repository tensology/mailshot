import express from 'express';

import { saveSendEmails, getEmails, toggleStarredEmail, deleteEmails, 
    moveEmailsToBin, sendEmail, syncMailbox } from '../controller/email-controller.js';

const routes = express.Router();

routes.post('/save', saveSendEmails);
routes.post('/send', sendEmail);
routes.post('/save-draft', saveSendEmails);
routes.get('/emails/:type', getEmails);
routes.post('/starred', toggleStarredEmail);
routes.delete('/delete', deleteEmails);
routes.post('/bin', moveEmailsToBin);
routes.post('/sync', syncMailbox);

export default routes;
