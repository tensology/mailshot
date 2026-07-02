const MAILBOX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    type TEXT NOT NULL DEFAULT 'inbox',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    from_address TEXT NOT NULL DEFAULT '',
    to_address TEXT NOT NULL DEFAULT '',
    cc_address TEXT NOT NULL DEFAULT '',
    bcc_address TEXT NOT NULL DEFAULT '',
    date_value TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    starred BOOLEAN NOT NULL DEFAULT FALSE,
    bin BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    spam BOOLEAN NOT NULL DEFAULT FALSE,
    in_inbox BOOLEAN NOT NULL DEFAULT TRUE,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    in_reply_to TEXT NOT NULL DEFAULT '',
    read_summary TEXT NOT NULL DEFAULT '',
    read_summary_status TEXT NOT NULL DEFAULT '',
    read_summary_at TIMESTAMPTZ,
    read_aloud_status TEXT NOT NULL DEFAULT '',
    imap_mailbox TEXT NOT NULL DEFAULT 'INBOX',
    imap_uid TEXT NOT NULL DEFAULT '',
    imap_deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS emails_message_id_unique_idx
ON emails (message_id)
WHERE message_id IS NOT NULL AND message_id <> '';

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    attachment_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size BIGINT NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_ingest_jobs (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    imap_mailbox TEXT NOT NULL DEFAULT 'INBOX',
    imap_uid TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    failure_reason TEXT NOT NULL DEFAULT '',
    server_delete_status TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#5f6368',
    user_id TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
`;

export const ensurePostgresSchema = async (pool) => {
    if (!pool?.query) {
        throw new Error('A Postgres pool with query(sql) is required.');
    }

    await pool.query(MAILBOX_SCHEMA_SQL);
};

export { MAILBOX_SCHEMA_SQL };
