import express from 'express';
import cors from 'cors';
import Connection from './database/db.js';
import routes from './routes/route.js';
import path from 'path';
import { startMailboxSync } from './services/mail-sync.js';
import { isDbConnected, getDbStatus } from './database/db.js';

const __dirname = path.resolve();

const app = express();

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());
app.use('/', routes);

app.use(express.static(path.join(__dirname, "./client/build")));

app.get('*', function (_, res){
    res.sendFile(path.join(__dirname, "./client/build/index.html"), function(err){
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
