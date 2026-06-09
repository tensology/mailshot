import express from 'express';
import cors from 'cors';
import Connection from './database/db.js';
import routes from './routes/route.js';
import path from 'path';
import { startMailboxSync } from './services/mail-sync.js';
import { isDbConnected, getDbStatus } from './database/db.js';
import { isAuthConfigured } from './services/auth-config.js';

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

app.get('/contacts', (req, res, next) => {
    if (req.method === 'GET' && isBrowserNavigation(req)) {
        return res.sendFile(SPA_ENTRY_POINT);
    }
    return next();
});

app.get('/emails/:type/:id', (req, res, next) => {
    if (req.method === 'GET' && isBrowserNavigation(req)) {
        return res.sendFile(SPA_ENTRY_POINT);
    }
    return next();
});

app.get('/emails/:type', (req, res, next) => {
    if (req.method === 'GET' && isBrowserNavigation(req)) {
        return res.sendFile(SPA_ENTRY_POINT);
    }
    return next();
});

app.use('/', routes);
app.use('/api', routes);

app.use(express.static(path.join(__dirname, './client/build')));

app.get('*', function (_, res){
    res.sendFile(SPA_ENTRY_POINT, function(err){
        res.status(500).send(err);
    })
})

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

startMailboxSync({
    intervalMs: Number(process.env.MAILBOX_POLL_INTERVAL_MS || 60000),
    enabled: syncEnabled
});

app.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
