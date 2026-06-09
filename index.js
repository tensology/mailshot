import express from 'express';
import cors from 'cors';
import Connection from './database/db.js';
import routes from './routes/route.js';
import path from 'path';
import { startMailboxSync } from './services/mail-sync.js';
import { isDbConnected, getDbStatus } from './database/db.js';

const __dirname = path.resolve();
const SPA_ENTRY_POINT = path.join(__dirname, './client/build/index.html');

const app = express();

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());

app.get('/emails/:type', (req, res, next) => {
    const acceptHeader = String(req.get('accept') || '').toLowerCase();
    const acceptHeaderAsJson = acceptHeader.includes('application/json');
    const isBrowserNavigation = req.headers['sec-fetch-mode'] === 'navigate'
        || req.headers['sec-fetch-dest'] === 'document'
        || (acceptHeader.includes('text/html') && !acceptHeaderAsJson);

    if (req.method === 'GET' && isBrowserNavigation) {
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

startMailboxSync({
    intervalMs: Number(process.env.MAILBOX_POLL_INTERVAL_MS || 60000),
    enabled: syncEnabled
});

app.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
