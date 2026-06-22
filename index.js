import express from 'express';
import cors from 'cors';
import Connection from './database/db.js';
import routes from './routes/route.js';
import path from 'path';
import { startMailboxSync } from './services/mail-sync.js';
import { isDbConnected, getDbStatus } from './database/db.js';
import { isAuthConfigured } from './services/auth-config.js';
import { loadLabelsFromDisk } from './services/label-store.js';
import { loadContactsFromDisk } from './services/contact-store.js';
import { loadSessionsFromDisk } from './services/auth-store.js';
import { loadSettingsFromDisk } from './services/settings-store.js';
import { loadLabelRulesFromDisk } from './services/label-rule-store.js';
import { startReadAloudCleanup } from './services/read-aloud-service.js';
import { startEmailSummaryWorker } from './services/email-summary-service.js';

const __dirname = path.resolve();
const SPA_ENTRY_POINT = path.join(__dirname, './client/build/index.html');
const APP_MODE = process.env.APP_MODE || process.env.NODE_ENV || 'production';
const isDevelopment = APP_MODE === 'development';

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const isBrowserNavigation = (req) => {
    const acceptHeader = String(req.get('accept') || '').toLowerCase();
    const acceptHeaderAsJson = acceptHeader.includes('application/json');
    return req.headers['sec-fetch-mode'] === 'navigate'
        || req.headers['sec-fetch-dest'] === 'document'
        || (acceptHeader.includes('text/html') && !acceptHeaderAsJson);
};

const serveSpa = (req, res) => res.sendFile(SPA_ENTRY_POINT);

const maybeServeSpa = (req, res, next) => {
    if (req.method === 'GET' && isBrowserNavigation(req)) {
        return serveSpa(req, res);
    }
    return next();
};

// Static assets and index.html must be served before authenticated API routes.
app.use(express.static(path.join(__dirname, './client/build')));

app.get('/login', maybeServeSpa);
app.get('/contacts', maybeServeSpa);
app.get('/emails/:type/:id', maybeServeSpa);
app.get('/emails/:type', maybeServeSpa);

app.use('/', routes);
app.use('/api', routes);

app.get('*', (req, res, next) => {
    if (req.method === 'GET' && isBrowserNavigation(req)) {
        return serveSpa(req, res);
    }
    return next();
});

const PORT = process.env.PORT || 8000;

Connection();

const syncEnabled = String(process.env.MAILBOX_SYNC_ENABLED ?? 'true') !== 'false';
if (isDbConnected()) {
    console.log('Database connected on boot:', getDbStatus());
}

if (isDevelopment) {
    console.log(`Mailshot running in ${APP_MODE} mode on port ${PORT}`);
}

if (isAuthConfigured()) {
    console.log('Login authentication is enabled');
} else {
    console.warn('Login authentication is not configured. Set AUTH_USERNAME/AUTH_PASSWORD or auth.config.json');
}

const loadedSessions = loadSessionsFromDisk();
if (loadedSessions > 0) {
    console.log(`Loaded ${loadedSessions} auth sessions from disk`);
}

const loadedLabels = loadLabelsFromDisk();
if (loadedLabels > 0) {
    console.log(`Loaded ${loadedLabels} labels from disk cache`);
}

const loadedContacts = loadContactsFromDisk();
if (loadedContacts > 0) {
    console.log(`Loaded ${loadedContacts} contacts from disk cache`);
}

const loadedSettings = loadSettingsFromDisk();
if (loadedSettings > 0) {
    console.log('Loaded app settings from disk cache');
}

const loadedLabelRules = loadLabelRulesFromDisk();
if (loadedLabelRules > 0) {
    console.log(`Loaded ${loadedLabelRules} label rules from disk cache`);
}

startMailboxSync({
    intervalMs: Number(process.env.MAILBOX_POLL_INTERVAL_MS || 60000),
    enabled: syncEnabled
});
startReadAloudCleanup();
startEmailSummaryWorker().catch((error) => {
    console.error('Email summary worker failed to start:', error.message || error);
});

app.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
