# Postgres Mailbox Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mongo/cache-backed mailbox state with Postgres-backed mailbox storage, IMAP intake, and sent-mail persistence.

**Architecture:** Add a Postgres-backed repository layer behind the existing controllers and intake services, then switch reads and writes to that layer while removing mailbox cache fallback behavior. Keep the API shape stable so the frontend does not need a full rewrite during the storage migration.

**Tech Stack:** Node.js, Express, `pg`, IMAPFlow, Nodemailer, node:test

---

### Task 1: Storage Foundation

**Files:**
- Create: `database/postgres.js`
- Create: `database/postgres-schema.js`
- Create: `database/postgres.test.js`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] Add `pg` dependency and Postgres env vars.
- [ ] Write failing storage bootstrap tests.
- [ ] Implement Postgres connection helpers and schema bootstrap.
- [ ] Run storage tests and make them pass.

### Task 2: Mailbox Repository

**Files:**
- Create: `services/mailbox-repository.js`
- Create: `services/mailbox-repository.test.js`
- Modify: `services/mailbox-read-state.js`

- [ ] Write failing repository tests for list/count/search/upsert/update/delete.
- [ ] Implement Postgres-backed mailbox repository methods.
- [ ] Verify repository tests pass.

### Task 3: Controller Cutover

**Files:**
- Modify: `controller/email-controller.js`
- Create: `controller/email-controller.postgres.test.js`

- [ ] Write failing controller tests for mailbox unavailable and Postgres-backed mutations.
- [ ] Switch inbox/count/search/message/mutation endpoints to the repository.
- [ ] Verify controller tests pass.

### Task 4: IMAP Intake And Sent Mail

**Files:**
- Modify: `services/mail-sync.js`
- Create: `services/mail-sync.postgres.test.js`

- [ ] Write failing tests for import-then-delete and sent-mail Postgres persistence.
- [ ] Implement Postgres ingest with delete-after-commit semantics.
- [ ] Verify intake tests pass.

### Task 5: Non-Mailbox Data Migration

**Files:**
- Create: `services/postgres-contact-store.js`
- Create: `services/postgres-label-store.js`
- Create: `services/postgres-settings-store.js`
- Modify: related controllers and boot code in `index.js`

- [ ] Write failing tests for Postgres-backed labels, contacts, and settings.
- [ ] Implement the stores and wire them into runtime boot.
- [ ] Verify tests pass.

### Task 6: Legacy Removal And Verification

**Files:**
- Modify: `database/db.js`
- Modify: `README.md`
- Modify: any runtime files still depending on mailbox Mongo fallback

- [ ] Remove active mailbox dependence on Mongo and stale mailbox cache fallback.
- [ ] Run the backend test suite.
- [ ] Document remaining deployment steps for live cutover.
