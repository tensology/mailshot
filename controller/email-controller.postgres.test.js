import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    getEmails,
    getMailboxCounts,
    searchEmails,
    getEmailThread,
    getEmailById,
    downloadAttachment,
    downloadAllAttachments,
    toggleReadEmail,
    archiveEmails,
    restoreArchivedEmails,
    deleteEmails,
    parseForwardedAttachmentRefs,
    createRetainedAttachmentSendPlan,
    createSendAttachmentOwnership,
    createUploadedAttachments,
    copyForwardedAttachments,
    runWithCleanupOnFailure,
    __setMailboxStoreForTests
} from './email-controller.js';

const createResponse = () => {
    const state = {
        statusCode: 200,
        payload: null,
        headers: {}
    };

    return {
        state,
        status(code) {
            state.statusCode = code;
            return this;
        },
        json(payload) {
            state.payload = payload;
            return this;
        },
        setHeader(name, value) {
            state.headers[name] = value;
            return this;
        },
        send(payload) {
            state.payload = payload;
            return this;
        }
    };
};

test('parseForwardedAttachmentRefs accepts valid forwarded attachment metadata only', () => {
    assert.deepEqual(parseForwardedAttachmentRefs(JSON.stringify([
        { emailId: 'email-1', attachmentId: 'attachment-1' },
        { email_id: 'email-2', attachment_id: 'attachment-2' },
        { emailId: '', attachmentId: 'missing-email' },
        { emailId: 'missing-attachment', attachmentId: '' }
    ])), [
        { emailId: 'email-1', attachmentId: 'attachment-1' },
        { emailId: 'email-2', attachmentId: 'attachment-2' }
    ]);

    assert.deepEqual(parseForwardedAttachmentRefs('not json'), []);
});

test('retained draft attachments are copied before the sent record reuses them', () => {
    const sourcePath = new URL('../package.json', import.meta.url).pathname;
    const source = {
        attachment_id: 'draft-attachment',
        filename: 'notice.pdf',
        content_type: 'application/pdf',
        size: fs.statSync(sourcePath).size,
        storage_path: sourcePath
    };
    const plan = createRetainedAttachmentSendPlan([source]);
    const [copied] = plan.attachments;

    try {
        assert.notEqual(copied.attachment_id, source.attachment_id);
        assert.notEqual(copied.storage_path, source.storage_path);
        assert.equal(copied.filename, source.filename);
        assert.equal(copied.content_type, source.content_type);
        assert.deepEqual(fs.readFileSync(copied.storage_path), fs.readFileSync(source.storage_path));
    } finally {
        plan.cleanup();
    }
});

test('legacy retained attachments keep their existing file ownership without copying', () => {
    const source = { attachment_id: 'legacy', storage_path: '/legacy/file.pdf' };
    let saveCalled = false;
    const plan = createRetainedAttachmentSendPlan([source], {
        copyFiles: false,
        saveFile: () => {
            saveCalled = true;
        }
    });

    assert.equal(plan.attachments[0], source);
    assert.equal(saveCalled, false);
    plan.cleanup();
});

test('a later retained attachment read failure removes copies already created', () => {
    const deleted = [];
    let readCount = 0;

    assert.throws(() => createRetainedAttachmentSendPlan([
        { filename: 'first.pdf', storage_path: '/source/first.pdf' },
        { filename: 'missing.pdf', storage_path: '/source/missing.pdf' }
    ], {
        readFile: () => (++readCount === 1 ? Buffer.from('first') : null),
        saveFile: () => ({
            attachment_id: 'copy-1',
            filename: 'first.pdf',
            storage_path: '/copies/first.pdf'
        }),
        deleteFile: (storagePath) => deleted.push(storagePath)
    }), /Attachment file missing: missing\.pdf/);

    assert.deepEqual(deleted, ['/copies/first.pdf']);
});

test('failed send or persistence actions clean retained copies idempotently', async () => {
    let cleanupCount = 0;
    await assert.rejects(
        runWithCleanupOnFailure(async () => {
            throw new Error('SMTP unavailable');
        }, () => { cleanupCount += 1; }),
        /SMTP unavailable/
    );
    assert.equal(cleanupCount, 1);

    const result = await runWithCleanupOnFailure(
        async () => ({ messageId: 'sent' }),
        () => { cleanupCount += 1; }
    );
    assert.deepEqual(result, { messageId: 'sent' });
    assert.equal(cleanupCount, 1);

    await assert.rejects(
        runWithCleanupOnFailure(async () => {
            throw new Error('sent record persistence failed');
        }, () => { cleanupCount += 1; }),
        /sent record persistence failed/
    );
    assert.equal(cleanupCount, 2);
});

test('uploaded attachments join the send ownership cleanup set', () => {
    const deleted = [];
    const ownership = createSendAttachmentOwnership({
        deleteFile: (storagePath) => deleted.push(storagePath)
    });
    const attachments = createUploadedAttachments([
        { buffer: Buffer.from('upload'), originalname: 'upload.pdf', mimetype: 'application/pdf' }
    ], ownership, {
        saveFile: () => ({ attachment_id: 'upload-1', storage_path: '/owned/upload.pdf' })
    });

    assert.equal(attachments[0].attachment_id, 'upload-1');
    ownership.cleanup();
    assert.deepEqual(deleted, ['/owned/upload.pdf']);
});

test('partial forwarded copy failure cleans all earlier send-owned files', async () => {
    const deleted = [];
    const ownership = createSendAttachmentOwnership({
        deleteFile: (storagePath) => deleted.push(storagePath)
    });
    let readCount = 0;

    await assert.rejects(runWithCleanupOnFailure(
        () => copyForwardedAttachments([
            { emailId: 'email-1', attachmentId: 'attachment-1' },
            { emailId: 'email-2', attachmentId: 'attachment-2' }
        ], ownership, {
            findEmail: async (emailId) => ({
                attachments: [{
                    attachment_id: emailId === 'email-1' ? 'attachment-1' : 'attachment-2',
                    filename: `${emailId}.pdf`,
                    storage_path: `/source/${emailId}.pdf`
                }]
            }),
            readFile: () => (++readCount === 1 ? Buffer.from('first') : null),
            saveFile: () => ({ attachment_id: 'copy-1', storage_path: '/owned/forwarded.pdf' })
        }),
        ownership.cleanup
    ), /Attachment file missing/);

    assert.deepEqual(deleted, ['/owned/forwarded.pdf']);
});

test('getEmails serves Postgres-backed mailbox data when the mailbox store is ready', async () => {
    const largeBody = `<p>${'private message '.repeat(1000)}</p>`;
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            list: async () => [{
                _id: 'email-1',
                type: 'inbox',
                subject: 'Hello',
                body: largeBody,
                body_html: largeBody,
                from: 'sender@example.com',
                to: 'user@example.com',
                cc: '',
                bcc: '',
                date: '2026-06-21T10:00:00.000Z',
                name: 'Sender',
                image: '',
                read: false,
                starred: false,
                bin: false,
                archived: false,
                spam: false,
                in_inbox: true,
                labels: [],
                references: [],
                in_reply_to: '',
                attachments: []
            }]
        }
    });

    const response = createResponse();

    await getEmails({
        params: { type: 'inbox' },
        query: {}
    }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.payload.total, 1);
    assert.equal(response.state.payload.emails[0]._id, 'email-1');
    assert.equal(response.state.payload.emails[0].body, undefined);
    assert.equal(response.state.payload.emails[0].body_html, undefined);
    assert.equal(response.state.payload.emails[0].preview.length, 500);
});

test('deleteEmails removes Postgres-backed emails without using the cache path', async () => {
    const deleted = [];
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            deleteMany: async (ids) => {
                deleted.push(...ids);
                return ids.length;
            }
        }
    });

    const response = createResponse();

    await deleteEmails({
        body: ['email-1', 'email-2']
    }, response);

    assert.equal(response.state.statusCode, 200);
    assert.deepEqual(deleted, ['email-1', 'email-2']);
    assert.equal(response.state.payload.count, 2);
});

test('getMailboxCounts reads unread counts from the Postgres mailbox store', async () => {
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            count: async (filter) => {
                if (filter.type === 'inbox') return 4;
                if (filter.archived === true) return 1;
                return 0;
            }
        }
    });

    const response = createResponse();

    await getMailboxCounts({}, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.payload.inbox_unread, 4);
    assert.equal(response.state.payload.system_unread.archived, 1);
});

test('searchEmails uses the Postgres mailbox store query path', async () => {
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            search: async () => [{
                _id: 'email-3',
                type: 'inbox',
                subject: 'Invoice',
                body: 'Travel invoice',
                from: 'ops@example.com',
                to: 'user@example.com',
                cc: '',
                bcc: '',
                date: '2026-06-21T10:00:00.000Z',
                name: 'Ops',
                image: '',
                read: false,
                starred: false,
                bin: false,
                archived: false,
                spam: false,
                in_inbox: true,
                labels: [],
                references: [],
                in_reply_to: '',
                attachments: []
            }]
        }
    });

    const response = createResponse();

    await searchEmails({ query: { q: 'invoice' } }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.payload.total, 1);
    assert.equal(response.state.payload.emails[0]._id, 'email-3');
});

test('getEmailById marks the Postgres-backed email as read', async () => {
    const updates = [];
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            findById: async () => ({
                _id: 'email-4',
                type: 'inbox',
                subject: 'Unread',
                body: '',
                from: 'sender@example.com',
                to: 'user@example.com',
                cc: '',
                bcc: '',
                date: '2026-06-21T10:00:00.000Z',
                name: 'Sender',
                image: '',
                read: false,
                starred: false,
                bin: false,
                archived: false,
                spam: false,
                in_inbox: true,
                labels: [],
                references: [],
                in_reply_to: '',
                attachments: []
            }),
            updateMany: async (ids, payload) => {
                updates.push({ ids, payload });
                return 1;
            }
        }
    });

    const response = createResponse();

    await getEmailById({ params: { id: 'email-4' } }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.payload.read, true);
    assert.deepEqual(updates[0], { ids: ['email-4'], payload: { read: true } });
});

test('downloadAttachment serves attachments for Postgres-backed email ids', async () => {
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            findById: async () => ({
                _id: 'email-5',
                attachments: [{
                    attachment_id: 'attachment-1',
                    filename: 'statement.pdf',
                    content_type: 'application/pdf',
                    storage_path: new URL('../package.json', import.meta.url).pathname
                }]
            })
        }
    });

    const response = createResponse();

    await downloadAttachment({
        params: {
            id: 'email-5',
            attachmentId: 'attachment-1'
        }
    }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.headers['Content-Type'], 'application/pdf');
    assert.equal(response.state.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(response.state.headers['Content-Disposition'], 'attachment; filename="statement.pdf"');
    assert.ok(Buffer.isBuffer(response.state.payload));
});

test('downloadAttachment can serve PDF attachments inline for previews', async () => {
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            findById: async () => ({
                _id: 'email-5',
                attachments: [{
                    attachment_id: 'attachment-1',
                    filename: 'statement.pdf',
                    content_type: 'application/pdf',
                    storage_path: new URL('../package.json', import.meta.url).pathname
                }]
            })
        }
    });

    const response = createResponse();

    await downloadAttachment({
        params: {
            id: 'email-5',
            attachmentId: 'attachment-1'
        },
        query: {
            disposition: 'inline'
        }
    }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.headers['Content-Disposition'], 'inline; filename="statement.pdf"');
    assert.ok(Buffer.isBuffer(response.state.payload));
});

test('downloadAttachment forces active content to download even when inline is requested', async () => {
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            findById: async () => ({
                _id: 'email-unsafe',
                attachments: [{
                    attachment_id: 'attachment-html',
                    filename: 'message.html',
                    content_type: 'text/html',
                    storage_path: new URL('../package.json', import.meta.url).pathname
                }]
            })
        }
    });

    const response = createResponse();
    await downloadAttachment({
        params: { id: 'email-unsafe', attachmentId: 'attachment-html' },
        query: { disposition: 'inline' }
    }, response);

    assert.equal(response.state.headers['Content-Disposition'], 'attachment; filename="message.html"');
    assert.equal(response.state.headers['X-Content-Type-Options'], 'nosniff');
});

test('downloadAllAttachments returns a zip for Postgres-backed email attachments', async () => {
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            findById: async () => ({
                _id: 'email-5',
                subject: 'Payment notification',
                attachments: [{
                    attachment_id: 'attachment-1',
                    filename: 'statement.pdf',
                    content_type: 'application/pdf',
                    storage_path: new URL('../package.json', import.meta.url).pathname
                }]
            })
        }
    });

    const response = createResponse();

    await downloadAllAttachments({
        params: { id: 'email-5' }
    }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.headers['Content-Type'], 'application/zip');
    assert.equal(response.state.headers['Content-Disposition'], 'attachment; filename="Payment notification.zip"');
    assert.equal(response.state.payload.readUInt32LE(0), 0x04034b50);
});

test('getEmailThread loads the Postgres-backed thread and marks it read', async () => {
    const updates = [];
    let listCalled = false;
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            findById: async () => ({
                _id: 'email-7',
                messageId: '<msg-7>',
                type: 'inbox',
                subject: 'Threaded',
                body: '',
                from: 'sender@example.com',
                to: 'user@example.com',
                cc: '',
                bcc: '',
                date: '2026-06-21T10:00:00.000Z',
                name: 'Sender',
                image: '',
                read: false,
                starred: false,
                bin: false,
                archived: false,
                spam: false,
                in_inbox: true,
                labels: [],
                references: ['<root>'],
                in_reply_to: '<root>',
                attachments: []
            }),
            findThread: async () => ([
                {
                    _id: 'email-8',
                    messageId: '<msg-8>',
                    type: 'inbox',
                    subject: 'Re: Threaded',
                    body: '',
                    from: 'user@example.com',
                    to: 'sender@example.com',
                    cc: '',
                    bcc: '',
                    date: '2026-06-21T10:05:00.000Z',
                    name: 'User',
                    image: '',
                    read: false,
                    starred: false,
                    bin: false,
                    archived: false,
                    spam: false,
                    in_inbox: true,
                    labels: [],
                    references: ['<msg-7>'],
                    in_reply_to: '<msg-7>',
                    attachments: []
                },
                {
                    _id: 'email-7',
                    messageId: '<msg-7>',
                    type: 'inbox',
                    subject: 'Threaded',
                    body: '',
                    from: 'sender@example.com',
                    to: 'user@example.com',
                    cc: '',
                    bcc: '',
                    date: '2026-06-21T10:00:00.000Z',
                    name: 'Sender',
                    image: '',
                    read: false,
                    starred: false,
                    bin: false,
                    archived: false,
                    spam: false,
                    in_inbox: true,
                    labels: [],
                    references: ['<root>'],
                    in_reply_to: '<root>',
                    attachments: []
                }
            ]),
            list: async () => {
                listCalled = true;
                return [];
            },
            updateMany: async (ids, payload) => {
                updates.push({ ids, payload });
                return ids.length;
            }
        }
    });

    const response = createResponse();

    await getEmailThread({ params: { id: 'email-7' } }, response);

    assert.equal(response.state.statusCode, 200);
    assert.equal(response.state.payload.length, 2);
    assert.equal(response.state.payload[0]._id, 'email-8');
    assert.equal(listCalled, false);
    assert.deepEqual(updates[0], { ids: ['email-8', 'email-7'], payload: { read: true } });
});

test('toggleReadEmail updates Postgres-backed read state', async () => {
    const updates = [];
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            updateMany: async (ids, payload) => {
                updates.push({ ids, payload });
                return 1;
            }
        }
    });

    const response = createResponse();

    await toggleReadEmail({ body: { id: 'email-5', value: true } }, response);

    assert.equal(response.state.statusCode, 200);
    assert.deepEqual(updates[0], { ids: ['email-5'], payload: { read: true } });
});

test('archiveEmails archives Postgres-backed emails', async () => {
    const updates = [];
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            updateMany: async (ids, payload) => {
                updates.push({ ids, payload });
                return ids.length;
            }
        }
    });

    const response = createResponse();

    await archiveEmails({ body: ['email-6'] }, response);

    assert.equal(response.state.statusCode, 200);
    assert.deepEqual(updates[0], {
        ids: ['email-6'],
        payload: {
            archived: true,
            in_inbox: false,
            spam: false,
            bin: false,
            starred: false
        }
    });
});

test('restoreArchivedEmails unarchives Postgres-backed emails', async () => {
    const updates = [];
    __setMailboxStoreForTests({
        ready: true,
        repository: {
            updateMany: async (ids, payload) => {
                updates.push({ ids, payload });
                return ids.length;
            }
        }
    });

    const response = createResponse();

    await restoreArchivedEmails({ body: ['email-6'] }, response);

    assert.equal(response.state.statusCode, 200);
    assert.deepEqual(updates[0], {
        ids: ['email-6'],
        payload: {
            archived: false,
            in_inbox: true,
            spam: false,
            bin: false
        }
    });
});
