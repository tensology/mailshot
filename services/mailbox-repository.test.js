import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createMailboxRepository,
    mapEmailRowToMailboxEmail
} from './mailbox-repository.js';

test('maps Postgres rows into the existing mailbox shape', () => {
    const email = mapEmailRowToMailboxEmail({
        id: 'email-1',
        message_id: '<msg-1>',
        type: 'inbox',
        subject: 'Hello',
        body: 'Plain body',
        body_html: '<p>Hello</p>',
        from_address: 'sender@example.com',
        to_address: 'user@example.com',
        cc_address: '',
        bcc_address: '',
        date_value: '2026-06-21T10:00:00.000Z',
        name: 'Sender',
        image: '',
        read: false,
        starred: true,
        bin: false,
        archived: false,
        spam: false,
        in_inbox: true,
        labels: ['Travel'],
        references_json: ['<root>'],
        in_reply_to: '<root>',
        read_summary: '',
        read_summary_status: '',
        read_summary_at: null,
        read_aloud_status: '',
        imap_mailbox: 'INBOX',
        imap_uid: '99',
        attachments: [{ attachment_id: 'a1', filename: 'ticket.pdf' }]
    });

    assert.deepEqual(email, {
        _id: 'email-1',
        messageId: '<msg-1>',
        type: 'inbox',
        subject: 'Hello',
        body: 'Plain body',
        body_html: '<p>Hello</p>',
        from: 'sender@example.com',
        to: 'user@example.com',
        cc: '',
        bcc: '',
        date: '2026-06-21T10:00:00.000Z',
        name: 'Sender',
        image: '',
        read: false,
        starred: true,
        bin: false,
        archived: false,
        spam: false,
        in_inbox: true,
        labels: ['Travel'],
        references: ['<root>'],
        in_reply_to: '<root>',
        read_summary: '',
        read_summary_status: '',
        read_summary_at: null,
        read_aloud_status: '',
        imap_mailbox: 'INBOX',
        imap_uid: '99',
        muted_until: null,
        snoozed_until: null,
        scheduled_send_at: null,
        attachments: [{ attachment_id: 'a1', filename: 'ticket.pdf' }]
    });
});

test('lists inbox emails with the expected SQL filters', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return {
                    rows: [{
                        id: 'email-1',
                        type: 'inbox',
                        subject: 'Hello',
                        body: '',
                        body_html: '',
                        from_address: 'sender@example.com',
                        to_address: 'user@example.com',
                        cc_address: '',
                        bcc_address: '',
                        date_value: '2026-06-21T10:00:00.000Z',
                        name: 'Sender',
                        image: '',
                        read: false,
                        starred: false,
                        bin: false,
                        archived: false,
                        spam: false,
                        in_inbox: true,
                        labels: ['travel'],
                        references_json: [],
                        in_reply_to: '',
                        read_summary: '',
                        read_summary_status: '',
                        read_summary_at: null,
                        read_aloud_status: '',
                        imap_mailbox: 'INBOX',
                        imap_uid: '42',
                        attachments: []
                    }]
                };
            }
        }
    });

    const rows = await repository.list({
        type: 'inbox',
        unread: true,
        label: 'travel',
        participant: 'sender@example.com'
    });

    assert.equal(rows.length, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /FROM emails e/i);
    assert.match(calls[0].text, /e\.type = \$1/i);
    assert.match(calls[0].text, /e\.read = \$2/i);
    assert.match(calls[0].text, /e\.labels \? \$3/i);
    assert.match(calls[0].text, /LOWER\(CONCAT_WS\(' ', e\.from_address, e\.to_address, e\.cc_address\)\) LIKE \$4/i);
});

test('upserts imported mail and persists JSON fields', async () => {
    const calls = [];
    const deletedPaths = [];
    const repository = createMailboxRepository({
        deleteAttachmentFileFn: (storagePath) => {
            deletedPaths.push(storagePath);
        },
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                if (/INSERT INTO emails/i.test(text)) {
                    return {
                        rows: [{
                            id: 'email-2',
                            message_id: '<msg-2>',
                            type: 'inbox',
                            subject: 'Imported',
                            body: 'Hello',
                            body_html: '<p>Hello</p>',
                            from_address: 'sender@example.com',
                            to_address: 'user@example.com',
                            cc_address: '',
                            bcc_address: '',
                            date_value: '2026-06-21T10:00:00.000Z',
                            name: 'Sender',
                            image: '',
                            read: true,
                            starred: false,
                            bin: false,
                            archived: false,
                            spam: false,
                            in_inbox: true,
                            labels: ['ops'],
                            references_json: ['<root>'],
                            in_reply_to: '<root>',
                            read_summary: '',
                            read_summary_status: '',
                            read_summary_at: null,
                            read_aloud_status: '',
                            imap_mailbox: 'INBOX',
                            imap_uid: '7',
                            attachments: []
                        }]
                    };
                }

                if (/SELECT storage_path FROM attachments/i.test(text)) {
                    return {
                        rows: [{ storage_path: '/tmp/old-ticket.pdf' }]
                    };
                }

                return {
                    rows: [],
                    rowCount: 1
                };
            }
        }
    });

    const email = await repository.upsert({
        messageId: '<msg-2>',
        type: 'inbox',
        subject: 'Imported',
        body: 'Hello',
        body_html: '<p>Hello</p>',
        from: 'sender@example.com',
        to: 'user@example.com',
        cc: '',
        bcc: '',
        date: '2026-06-21T10:00:00.000Z',
        name: 'Sender',
        image: '',
        read: true,
        starred: false,
        bin: false,
        archived: false,
        spam: false,
        in_inbox: true,
        labels: ['ops'],
        references: ['<root>'],
        in_reply_to: '<root>',
        imap_mailbox: 'INBOX',
        imap_uid: '7',
        attachments: [{
            attachment_id: 'att-1',
            filename: 'ticket.pdf',
            content_type: 'application/pdf',
            size: 42,
            storage_path: '/tmp/ticket.pdf'
        }]
    });

    assert.equal(email._id, 'email-2');
    assert.equal(calls.length, 6);
    assert.equal(calls[0].text, 'BEGIN');
    assert.match(calls[1].text, /INSERT INTO emails/i);
    assert.match(calls[2].text, /SELECT storage_path FROM attachments/i);
    assert.match(calls[3].text, /DELETE FROM attachments/i);
    assert.match(calls[4].text, /INSERT INTO attachments/i);
    assert.equal(calls[5].text, 'COMMIT');
    assert.match(calls[1].text, /ON CONFLICT \(id\)/i);
    assert.equal(calls[1].values[14], '["ops"]');
    assert.equal(calls[1].values[15], '["<root>"]');
    assert.deepEqual(deletedPaths, ['/tmp/old-ticket.pdf']);
    // Sync re-imports must not wipe UI archive/bin state.
    assert.match(calls[1].text, /archived = emails\.archived/i);
    assert.match(calls[1].text, /in_inbox = emails\.in_inbox/i);
});

test('upsert rolls back email and attachment rows together when attachment persistence fails', async () => {
    const calls = [];
    const deletedPaths = [];
    const client = {
        query: async (text) => {
            calls.push(text);
            if (/INSERT INTO emails/i.test(text)) {
                return { rows: [{ id: 'email-rollback', attachments: [] }] };
            }
            if (/SELECT storage_path FROM attachments/i.test(text)) {
                return { rows: [{ storage_path: '/old/file.pdf' }] };
            }
            if (/INSERT INTO attachments/i.test(text)) {
                throw new Error('attachment insert failed');
            }
            return { rows: [], rowCount: 1 };
        },
        release: () => calls.push('RELEASE')
    };
    const repository = createMailboxRepository({
        pool: { connect: async () => client },
        deleteAttachmentFileFn: (storagePath) => deletedPaths.push(storagePath)
    });

    await assert.rejects(repository.upsert({
        id: 'email-rollback',
        attachments: [{ attachment_id: 'attachment', storage_path: '/new/file.pdf' }]
    }), /attachment insert failed/);

    assert.equal(calls[0], 'BEGIN');
    assert.equal(calls.at(-2), 'ROLLBACK');
    assert.equal(calls.at(-1), 'RELEASE');
    assert.equal(calls.includes('COMMIT'), false);
    assert.deepEqual(deletedPaths, []);
});

test('upsert commits email and attachment rows before deleting replaced files', async () => {
    const events = [];
    const client = {
        query: async (text) => {
            events.push(text);
            if (/INSERT INTO emails/i.test(text)) {
                return { rows: [{ id: 'email-commit', attachments: [] }] };
            }
            if (/SELECT storage_path FROM attachments/i.test(text)) {
                return { rows: [{ storage_path: '/old/file.pdf' }] };
            }
            return { rows: [], rowCount: 1 };
        },
        release: () => events.push('RELEASE')
    };
    const repository = createMailboxRepository({
        pool: { connect: async () => client },
        deleteAttachmentFileFn: (storagePath) => events.push(`DELETE_FILE:${storagePath}`)
    });

    await repository.upsert({
        id: 'email-commit',
        attachments: [{ attachment_id: 'attachment', storage_path: '/new/file.pdf' }]
    });

    assert.ok(events.indexOf('COMMIT') < events.indexOf('DELETE_FILE:/old/file.pdf'));
    assert.ok(events.indexOf('RELEASE') < events.indexOf('DELETE_FILE:/old/file.pdf'));
});

test('finds an email by message id', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return {
                    rows: [{
                        id: 'email-9',
                        message_id: '<msg-9>',
                        type: 'inbox',
                        subject: 'Found',
                        body: '',
                        body_html: '',
                        from_address: 'a@b.c',
                        to_address: 'd@e.f',
                        cc_address: '',
                        bcc_address: '',
                        date_value: '2026-06-21T10:00:00.000Z',
                        name: '',
                        image: '',
                        read: false,
                        starred: false,
                        bin: false,
                        archived: true,
                        spam: false,
                        in_inbox: false,
                        labels: [],
                        references_json: [],
                        in_reply_to: '',
                        read_summary: '',
                        read_summary_status: '',
                        read_summary_at: null,
                        read_aloud_status: '',
                        imap_mailbox: 'INBOX',
                        imap_uid: '',
                        attachments: []
                    }]
                };
            }
        }
    });

    const email = await repository.findByMessageId('<msg-9>');
    assert.equal(email._id, 'email-9');
    assert.equal(email.archived, true);
    assert.match(calls[0].text, /message_id = \$1/i);
    assert.equal(calls[0].values[0], '<msg-9>');
});

test('counts unread mail by mailbox type', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return { rows: [{ total: '12' }] };
            }
        }
    });

    const count = await repository.count({ type: 'inbox', unread: true });

    assert.equal(count, 12);
    assert.match(calls[0].text, /COUNT\(\*\)::int AS total/i);
});

test('updates many emails with the requested fields', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return { rowCount: 2, rows: [] };
            }
        }
    });

    const rowCount = await repository.updateMany(['email-1', 'email-2'], {
        bin: true,
        spam: false,
        type: ''
    });

    assert.equal(rowCount, 2);
    assert.match(calls[0].text, /UPDATE emails/i);
    assert.match(calls[0].text, /WHERE id = ANY/i);
});

test('updates label arrays as jsonb', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return { rowCount: 1, rows: [] };
            }
        }
    });

    await repository.updateMany(['email-1'], {
        labels: ['travel', 'ops']
    });

    assert.match(calls[0].text, /labels = \$1::jsonb/i);
    assert.equal(calls[0].values[0], '["travel","ops"]');
});

test('deletes many emails by id', async () => {
    const calls = [];
    const deletedPaths = [];
    const repository = createMailboxRepository({
        deleteAttachmentFileFn: (storagePath) => {
            deletedPaths.push(storagePath);
        },
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                if (/SELECT DISTINCT storage_path FROM attachments/i.test(text)) {
                    return {
                        rowCount: 2,
                        rows: [
                            { storage_path: '/tmp/a.pdf' },
                            { storage_path: '/tmp/b.pdf' }
                        ]
                    };
                }
                return { rowCount: 3, rows: [] };
            }
        }
    });

    const rowCount = await repository.deleteMany(['email-1', 'email-2', 'email-3']);

    assert.equal(rowCount, 3);
    assert.match(calls[0].text, /SELECT DISTINCT storage_path FROM attachments/i);
    assert.match(calls[1].text, /DELETE FROM emails/i);
    assert.deepEqual(calls[1].values[0], ['email-1', 'email-2', 'email-3']);
    assert.deepEqual(deletedPaths, ['/tmp/a.pdf', '/tmp/b.pdf']);
});

test('searches mailbox content with a case-insensitive query', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return { rows: [] };
            }
        }
    });

    await repository.search('travel invoice');

    assert.match(calls[0].text, /e\.body_html/i);
    assert.match(calls[0].text, /FROM attachments a_search/i);
    assert.match(calls[0].text, /a_search\.filename/i);
    assert.equal(calls[0].values[0], '%travel invoice%');
});

test('list search also matches attachment filenames', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return { rows: [] };
            }
        }
    });

    await repository.list({ search: 'I0717' });

    assert.match(calls[0].text, /FROM attachments a_search/i);
    assert.match(calls[0].text, /a_search\.filename/i);
    assert.equal(calls[0].values.at(-1), '%i0717%');
});

test('finds a single email by id', async () => {
    const repository = createMailboxRepository({
        pool: {
            query: async () => ({
                rows: [{
                    id: 'email-9',
                    message_id: '<msg-9>',
                    type: 'sent',
                    subject: 'Sent',
                    body: '',
                    body_html: '',
                    from_address: 'me@example.com',
                    to_address: 'you@example.com',
                    cc_address: '',
                    bcc_address: '',
                    date_value: '2026-06-21T10:00:00.000Z',
                    name: 'Me',
                    image: '',
                    read: true,
                    starred: false,
                    bin: false,
                    archived: false,
                    spam: false,
                    in_inbox: false,
                    labels: [],
                    references_json: [],
                    in_reply_to: '',
                    read_summary: '',
                    read_summary_status: '',
                    read_summary_at: null,
                    read_aloud_status: '',
                    imap_mailbox: 'INBOX',
                    imap_uid: '11',
                    attachments: []
                }]
            })
        }
    });

    const email = await repository.findById('email-9');

    assert.equal(email._id, 'email-9');
    assert.equal(email.type, 'sent');
});

test('finds a thread from message ids and normalized subject without loading the full mailbox', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return {
                    rows: [{
                        id: 'email-10',
                        message_id: '<msg-10>',
                        type: 'inbox',
                        subject: 'Re: Project update',
                        body: '',
                        body_html: '',
                        from_address: 'sender@example.com',
                        to_address: 'user@example.com',
                        cc_address: '',
                        bcc_address: '',
                        date_value: '2026-06-21T10:10:00.000Z',
                        name: 'Sender',
                        image: '',
                        read: false,
                        starred: false,
                        bin: false,
                        archived: false,
                        spam: false,
                        in_inbox: true,
                        labels: [],
                        references_json: ['<root>'],
                        in_reply_to: '<root>',
                        read_summary: '',
                        read_summary_status: '',
                        read_summary_at: null,
                        read_aloud_status: '',
                        imap_mailbox: 'INBOX',
                        imap_uid: '12',
                        attachments: []
                    }]
                };
            }
        }
    });

    const thread = await repository.findThread({
        _id: 'email-10',
        messageId: '<msg-10>',
        in_reply_to: '<msg-9>',
        references: ['<root>'],
        subject: 'Fwd: Re: Project update'
    });

    assert.equal(thread.length, 1);
    assert.equal(thread[0]._id, 'email-10');
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /WITH RECURSIVE related_ids/i);
    assert.match(calls[0].text, /e\.in_reply_to = r\.message_id/i);
    assert.match(calls[0].text, /e\.references_json \? r\.message_id/i);
    assert.match(calls[0].text, /e\.bin = FALSE OR e\.id = \$3/i);
    assert.match(calls[0].text, /ORDER BY e\.date_value DESC/i);
    assert.deepEqual(calls[0].values[0], ['<msg-10>', '<msg-9>', '<root>']);
    assert.equal(calls[0].values[1], 'project update');
    assert.equal(calls[0].values[2], 'email-10');
});

test('upserts draft mail by id when no message id exists', async () => {
    const calls = [];
    const repository = createMailboxRepository({
        pool: {
            query: async (text, values) => {
                calls.push({ text, values });
                return {
                    rows: [{
                        id: 'draft-1',
                        message_id: null,
                        type: 'drafts',
                        subject: 'Draft',
                        body: '',
                        body_html: '',
                        from_address: 'me@example.com',
                        to_address: '',
                        cc_address: '',
                        bcc_address: '',
                        date_value: '2026-06-21T10:00:00.000Z',
                        name: 'Me',
                        image: '',
                        read: true,
                        starred: false,
                        bin: false,
                        archived: false,
                        spam: false,
                        in_inbox: false,
                        labels: [],
                        references_json: [],
                        in_reply_to: '',
                        read_summary: '',
                        read_summary_status: '',
                        read_summary_at: null,
                        read_aloud_status: '',
                        imap_mailbox: 'INBOX',
                        imap_uid: '',
                        attachments: []
                    }]
                };
            }
        }
    });

    await repository.upsert({
        id: 'draft-1',
        type: 'drafts',
        subject: 'Draft',
        from: 'me@example.com',
        read: true,
        in_inbox: false
    });

    assert.equal(calls[0].text, 'BEGIN');
    assert.match(calls[1].text, /ON CONFLICT \(id\)/i);
    assert.equal(calls.at(-1).text, 'COMMIT');
});
