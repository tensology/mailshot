# Postgres Mailbox Migration Design

## Goal

Move Mailshot to a single-source-of-truth mailbox model where Postgres owns all mailbox state and message records. IMAP becomes an intake source only. After a message is imported into Postgres successfully, Mailshot deletes it from the IMAP server. Sent mail is also stored in Postgres by Mailshot after SMTP send succeeds.

This design removes the current split between:

- IMAP mailbox contents
- Mongo-backed email metadata
- disk mailbox cache fallback

The result should be deterministic archive/bin/delete behavior with no silent fallback to stale mailbox state.

## Current Problems

- Mailshot stores mailbox state in MongoDB models plus a disk cache in `data/mailbox-cache.json`.
- When Mongo is unavailable, Mailshot can still read and write mailbox state against the disk cache.
- The app currently polls IMAP and copies recent messages into either Mongo or the cache.
- App actions like archive, bin, and delete mutate Mailshot state, not the IMAP mailbox.
- This creates split-brain behavior where the UI can show stale or resurrected messages.

## Scope

This project covers:

- replacing Mongo-backed mailbox storage with Postgres
- replacing mailbox disk-cache fallback with explicit failure states
- importing incoming IMAP messages into Postgres
- deleting IMAP copies only after successful Postgres ingestion
- storing sent mail in Postgres after SMTP send
- migrating labels, contacts, settings, and email records away from Mongo
- removing MongoDB from runtime mailbox flows

This project does not require:

- keeping IMAP as a long-term recovery copy
- syncing bidirectional mailbox state with the server
- preserving Mailshot as a view onto a canonical IMAP store

## Source Of Truth

Postgres is the only source of truth for:

- inbox, archived, bin, spam, starred, unread state
- labels and contact data
- settings and mailbox-related app behavior
- sent message history shown in the UI

IMAP is only used to:

- fetch newly arrived mail
- provide the raw message body and attachments during ingestion
- support deletion retries when a message was imported but the server copy was not yet removed

SMTP is only used to:

- transmit outbound mail to recipients

## Recommended Architecture

### Storage

Use Postgres for all durable app data.

Introduce mailbox tables:

- `emails`
- `attachments`
- `labels`
- `email_labels`
- `contacts`
- `settings`
- `mailbox_ingest_jobs`

`emails` stores:

- mailbox ownership if multi-user support is needed later
- sender and recipient fields
- subject
- plaintext body
- HTML body
- message id and threading headers
- received/sent timestamps
- mailbox state flags
- original IMAP metadata needed for deletion and troubleshooting
- ingest and deletion status fields

`attachments` stores:

- foreign key to email
- filename
- content type
- byte size
- storage path
- checksum if we want future integrity validation

`mailbox_ingest_jobs` stores:

- ingest attempt id
- source mailbox
- IMAP UID if available
- message id
- status
- failure reason
- server-delete status
- retry timestamps

### Attachment Storage

Keep attachment files on disk for the first migration phase and store only metadata plus file paths in Postgres. This keeps the port focused and avoids introducing object storage at the same time.

### Application Boundary

Split mailbox behavior into clear modules:

- `mailbox-intake`: IMAP polling, fetch, parse, and delete workflow
- `mailbox-repository`: all Postgres reads and writes for email state
- `mailbox-actions`: archive/bin/restore/delete/star/read workflows
- `mailbox-migration`: one-off import from Mongo/cache into Postgres
- `mailbox-health`: explicit readiness checks and surfaced failure states

The current controllers should stop manipulating persistence details directly.

## Data Flow

### Incoming Mail

1. Poll IMAP on the configured interval.
2. Fetch candidate messages from the server mailbox.
3. Parse message headers, bodies, and attachments.
4. Begin a Postgres transaction.
5. Upsert the email row by stable mailbox identity plus `message_id`.
6. Insert attachment metadata and write attachment files.
7. Record an ingest job row as successful.
8. Commit the transaction.
9. Delete the imported IMAP message from the server.
10. Mark the server-delete step successful.

Important invariant:

- IMAP deletion must never happen before the Postgres transaction commits.

### Incoming Failure Cases

- If IMAP connection or fetch fails: do not write partial state and do not delete from IMAP.
- If Postgres write fails: rollback and do not delete from IMAP.
- If attachment persistence fails: rollback and do not delete from IMAP.
- If Postgres commit succeeds but IMAP delete fails: keep the Postgres row, mark delete as pending, and retry server deletion later.
- If a duplicate message is fetched again before server deletion succeeds: detect by `message_id` and avoid duplicate rows.

### Outgoing Mail

1. User composes and sends from Mailshot.
2. Mailshot sends the message through SMTP.
3. If SMTP succeeds, Mailshot writes the sent message to Postgres.
4. The Sent view reads from Postgres only.

If SMTP fails:

- no sent record is created
- the user receives a clear error

## User Actions

### Archive

- Update the Postgres email row to `archived = true`
- Remove inbox visibility fields as needed
- Do not call IMAP

### Move To Bin

- Update the Postgres email row to `bin = true`
- Do not call IMAP

### Restore From Bin

- Update the Postgres email row back to inbox state
- Do not call IMAP

### Hard Delete From Bin

- Remove the Postgres email row
- Remove related attachment rows
- Delete related attachment files and generated read-aloud assets
- If the row still has an undeleted IMAP server reference because ingest cleanup lagged, issue IMAP delete as part of the hard delete workflow or enqueue it for immediate retry

### Read, Star, Label, Spam

- Update Postgres only
- Do not mirror these states to IMAP

## Migration Plan

### Phase 1: Introduce Postgres

- add a Postgres client and configuration
- add schema creation and migrations
- add repository layer for mailbox reads and writes

### Phase 2: Postgres Intake Cutover

- change IMAP intake to write into Postgres
- stop creating new Mongo mailbox records
- keep IMAP deletion behind a feature flag for the first live rollout
- keep explicit failure responses if Postgres is unavailable

### Phase 3: App Read Cutover

- switch inbox, counts, search, and message views to Postgres-backed queries only
- switch mailbox actions to Postgres-backed mutations only
- remove disk mailbox-cache fallbacks from mailbox endpoints

### Phase 4: State Migration

- export any reachable Mongo records for emails, labels, contacts, and settings
- import them into Postgres with deterministic transforms
- if no valid Mongo data exists, migrate only the durable data sources that still exist and accept that stale cache data is not trustworthy mailbox truth

### Phase 5: Remove Legacy Mailbox Storage

- remove mailbox read/write paths that depend on Mongo
- remove mailbox cache persistence as a fallback source of truth
- keep only narrowly scoped temporary retry state if required for IMAP deletion retries

### Phase 6: Retire Mongo

- remove Mongoose models and Mongo connection code from active runtime
- remove Mongo environment requirements from docs and deployment
- uninstall Mongo from the server after the app no longer depends on it

## Data Model Notes

The schema should preserve enough information to re-render the current UI without fallback reconstruction:

- exact sender/recipient strings
- normalized participant search fields
- thread fields from `message_id`, `in_reply_to`, and `references`
- `type` or mailbox grouping fields for inbox and sent views
- boolean mailbox state fields
- label associations
- summary and read-aloud status fields already present in the app

Use unique constraints on stable identifiers where possible:

- unique email `message_id` per mailbox identity
- unique label slug per mailbox identity

## Error Handling And Visibility

Mailbox endpoints must fail loudly when the mailbox store is unavailable.

Required behavior:

- no silent fallback to stale disk cache
- no fabricated counts from partial sources
- no successful response when write-through guarantees were not met

The UI should show:

- mailbox unavailable when Postgres is unavailable
- sync failed when IMAP intake is failing
- retrying server cleanup when an imported message could not yet be deleted from IMAP

## Testing Strategy

### Unit Tests

- repository operations for email state updates
- ingest transaction behavior
- duplicate detection by `message_id`
- IMAP delete retry bookkeeping
- sent-mail persistence after SMTP success

### Integration Tests

- IMAP fetch -> Postgres write -> IMAP delete happy path
- Postgres write failure prevents IMAP delete
- attachment persistence failure rolls back the email row
- hard delete removes files and associated rows
- inbox/count/search endpoints return unavailable when the mailbox store is down

### Migration Tests

- Mongo email document to Postgres row mapping
- label/contact/settings migration transforms
- cache records are not treated as authoritative mailbox truth during migration

### Live Verification

- ingest a small controlled mailbox slice first
- verify imported counts in Postgres
- verify IMAP messages disappear after successful import
- verify sent mail appears in Postgres after SMTP send
- verify archive/bin/hard delete never resurrect old messages after restart

## Deployment Notes

- add Postgres connection settings to environment configuration
- provision database backups before cutover
- deploy schema and app code before enabling IMAP deletion
- gate IMAP deletion behind a feature flag during the first live rollout
- remove the flag only after successful slice validation against a controlled mailbox slice

## Risks And Mitigations

### Risk: Message loss during cutover

Mitigation:

- delete from IMAP only after a committed Postgres transaction
- keep ingest job records and deletion retry state
- start with a controlled mailbox slice before full rollout

### Risk: Duplicate imports

Mitigation:

- enforce unique constraints on message identity
- make intake idempotent

### Risk: Large attachments or filesystem failures

Mitigation:

- persist attachments before commit
- rollback on write failures
- add cleanup for orphaned temporary files

### Risk: Old stale cache contaminates the new store

Mitigation:

- do not use stale disk cache as authoritative migration input unless explicitly selected for a one-off recovery process

## Acceptance Criteria

- Mailshot mailbox views read from Postgres only
- new incoming IMAP mail is imported into Postgres and then deleted from the IMAP server
- sent mail is stored in Postgres after SMTP send
- archive, bin, restore, read, star, label, and spam actions update Postgres only
- hard delete removes the Postgres record and associated local assets, and also deletes any lingering IMAP copy when present
- mailbox endpoints never silently fall back to stale cache data
- MongoDB is no longer required for runtime mailbox behavior

## Recommendation

Implement the single-source-of-truth Postgres model with IMAP as intake-only and SMTP as send-only. This is the smallest architecture that satisfies the requested behavior and eliminates the current split-brain mailbox state.
