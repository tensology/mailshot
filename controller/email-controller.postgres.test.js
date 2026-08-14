import test from 'node:test';
import assert from 'node:assert/strict';

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
