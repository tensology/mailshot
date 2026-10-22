# Mailshot Integration API

_Last updated 2026-10-22. Applies to Mailshot commit `e361a5b27` plus the staged patch
`mailshot-integration-crud.patch` (routes marked **[patch]** only exist once that patch is applied
and `mailshot-ui` is restarted; the matching hub routes need `tensology-hub-mail-crud.patch`)._

## Topology

```
Cursor / Codex (mailshot MCP)  ─┐
DecisionsAI tensology_workspace ─┼─►  https://www.tensology.com/api/integrations/v1/mail/*   (Django hub, scope checks + audit)
                                 │            │  MAILSHOT_INTERNAL_BASE_URL (default http://127.0.0.1:8000)
                                 │            ▼
                                 └──►  Mailshot  /api/integrations/v1/*   (Express, systemd unit mailshot-ui,
                                                 /var/www/mailshot.tensology.com, node index.js, PORT 8000)
                                                      │ IMAP sync (imapflow) / SMTP send (nodemailer) / Postgres store
                                                      ▼
                                                 mailbox paul@mailshot.tensology.com (sender Paul@Tensology.com)
```

Mailshot itself (port 8000) is not meant to be called directly from outside; use the hub URL.

## Auth

* `Authorization: Bearer <key>` — a Tensology **IntegrationCredential** with audience `decisionsai`
  (created in the Tensology admin). Never put the key in docs or repos.
  * DecisionsAI stores it in its Settings DB (`tensology_enabled`, `tensology_url`, `tensology_key`).
  * The MCP server reads env `TENSOLOGY_MAIL_API_KEY`, or the file `~/.config/mailshot-mcp/token` (chmod 600).
* Scopes (hub): `mail.read`, `mail.drafts.read`, `mail.drafts.write`, `mail.send`, and new **[patch]** `mail.manage`
  (labels + delete of received mail). Existing credentials must have `mail.manage` added to their `scopes` JSON.
* Mailshot verifies every key by POSTing it to `${TENSOLOGY_API_URL}/api/integrations/v1/auth/introspect`
  (env `TENSOLOGY_API_ENABLED`, `TENSOLOGY_API_URL`); it accepts audience `mailshot` + `mail.service`, or
  audience `decisionsai` with any `mail.*` scope.
* Every mutation needs `Idempotency-Key: <unique>`. Optional: `X-Request-ID`, `X-Tensology-Source`.
* `POST mail/send` additionally needs `X-Tensology-Approval: explicit` and scope `mail.send`.
* Responses are envelopes: `{"data": ..., "error": null|{code,message}, "meta": {...}}`.

```bash
BASE=https://www.tensology.com/api/integrations/v1
AUTH="Authorization: Bearer $TENSOLOGY_MAIL_API_KEY"
```

## Operations

| Op | Method & path (hub) | Hub scope | Status |
|---|---|---|---|
| List by section | `GET mail/messages?folder=<section>` | mail.read | live |
| Filter by tag/label | `GET mail/messages?folder=inbox&label=<slug>` (`tag=` alias **[patch]**) | mail.read | live |
| Search | `GET mail/messages?search=<text>` (live) / `GET mail/search?q=<text>` **[patch]** | mail.read | live / patch |
| Read one / thread | `GET mail/messages/<id>[?include_thread=true]` — marks the message read | mail.read | live |
| List drafts | `GET mail/drafts` | mail.drafts.read | live |
| Read draft | `GET mail/drafts/<id>` | mail.drafts.read | live |
| Create draft | `POST mail/drafts` | mail.drafts.write | live |
| Update draft | `PATCH mail/drafts/<id>` | mail.drafts.write | live |
| Delete draft | `DELETE mail/drafts/<id>` (only records of type drafts; 409 otherwise) | mail.drafts.write | **[patch]** |
| Trash message | `DELETE mail/messages/<id>` → Bin (recoverable) | mail.manage | **[patch]** |
| Purge message | `DELETE mail/messages/<id>?permanent=true` (only if already in Bin) | mail.manage | **[patch]** |
| List labels | `GET mail/labels` | mail.read | **[patch]** |
| Set labels | `PUT mail/messages/<id>/labels` `{"labels":["slug",...]}` | mail.manage | **[patch]** |
| Read/unread/archive | Mailshot `PATCH messages/<id>/state` — **mailshot audience only**, not exposed by hub | mail.service | live (internal) |
| Send | `POST mail/send` + `X-Tensology-Approval: explicit` — **real SMTP send** | mail.send | live (not in MCP) |

Sections (`folder`, or `section` **[patch]**): `inbox`, `sent`, `drafts`, `archived`, `spam`, `bin`, `starred`, `allmail`.
**[patch]** aliases: `incoming|received→inbox`, `outgoing→sent`, `trash→bin`, `archive→archived`, `all→allmail`.
`label` filtering applies to inbox, sent, drafts and allmail. Other list params: `search`, `participant`,
`unread=true`, `page` (default 1), `limit` (1–100, default 50). Lists return compact summaries
(`_id, subject, from, to, cc, date, read, starred, labels, attachments meta, thread_count, preview`), not bodies.

### Examples

```bash
# 5 newest inbox items
curl -s -H "$AUTH" "$BASE/mail/messages?folder=inbox&limit=5"
# sent mail tagged "clients"
curl -s -H "$AUTH" "$BASE/mail/messages?folder=sent&label=clients"
# search
curl -s -H "$AUTH" "$BASE/mail/messages?folder=allmail&search=invoice"
curl -s -H "$AUTH" "$BASE/mail/search?q=invoice&limit=10"            # [patch]
# full thread
curl -s -H "$AUTH" "$BASE/mail/messages/<id>?include_thread=true"
# create / update draft (never sends)
curl -s -X POST  -H "$AUTH" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
     -d '{"to":["someone@example.com"],"subject":"Hello","text":"Body"}' "$BASE/mail/drafts"
curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
     -d '{"subject":"Hello v2"}' "$BASE/mail/drafts/<draft_id>"
# delete draft / trash message / labels   [patch]
curl -s -X DELETE -H "$AUTH" -H "Idempotency-Key: $(uuidgen)" "$BASE/mail/drafts/<draft_id>"
curl -s -X DELETE -H "$AUTH" -H "Idempotency-Key: $(uuidgen)" "$BASE/mail/messages/<id>"
curl -s -H "$AUTH" "$BASE/mail/labels"
curl -s -X PUT -H "$AUTH" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
     -d '{"labels":["clients"]}' "$BASE/mail/messages/<id>/labels"
```

Draft body fields: `to`, `cc`, `bcc` (string or list), `subject`, `text` (or `body`), `html` (or `body_html`),
`inReplyTo`, `references`.

## How DecisionsAI uses it

`distr/core/agent/tools/integrations/tensology_workspace.py` (tool `tensology_workspace`) via
`distr/core/tensology_client.py`: actions `list_mail` → `GET mail/messages`, `read_mail`/`read_latest_mail` →
`GET mail/messages/<id>`, `list_drafts`, `save_draft` → `POST mail/drafts`, `send_mail` → `POST mail/send`
(only with `approved=true`). Settings: `tensology_enabled`, `tensology_url` (default https://www.tensology.com),
`tensology_key`. The hub also polls Mailshot for "incoming" intake using env `MAILSHOT_TENSOLOGY_API_KEY`.

## MCP server (Cursor + Codex)

File: `~/development/TENSOLOGY/mailshot-mcp/mailshot_mcp.py` (Python stdlib, stdio). **No send tool.**
Config: `MAILSHOT_API_BASE` (default `https://www.tensology.com/api/integrations/v1`), key from
`TENSOLOGY_MAIL_API_KEY` or `~/.config/mailshot-mcp/token`.

| Tool | Calls |
|---|---|
| `mailshot_list_messages` (section, label, search, participant, unread, page, limit) | GET mail/messages |
| `mailshot_search` (q) | GET mail/search **[patch]** |
| `mailshot_get_message` (id, include_thread) | GET mail/messages/<id> |
| `mailshot_list_drafts`, `mailshot_get_draft` | GET mail/drafts[/id] |
| `mailshot_create_draft`, `mailshot_update_draft` | POST / PATCH mail/drafts |
| `mailshot_delete_draft` | DELETE mail/drafts/<id> **[patch]** |
| `mailshot_trash_message` (id, permanent) | DELETE mail/messages/<id> **[patch]** |
| `mailshot_list_labels`, `mailshot_set_labels` | GET mail/labels, PUT mail/messages/<id>/labels **[patch]** |

Registered as `mailshot` in `~/.cursor/mcp.json` (`mcpServers.mailshot`) and `~/.codex/config.toml`
(`[mcp_servers.mailshot]`). In Cursor/Codex just ask e.g. "list my 5 newest Mailshot inbox mails" or
"draft a reply in Mailshot to …".

## Enabling the [patch] routes (needs Paul's approval — restarts live services)

```bash
# Mailshot (on prod)
cd /var/www/mailshot.tensology.com
for f in controller/integration-controller.js routes/integration-route.js; do cp -p $f $f.bak-20261022; done
patch -p1 --dry-run < /root/mailshot-api-staging-20261022/mailshot-integration-crud.patch && \
patch -p1 < /root/mailshot-api-staging-20261022/mailshot-integration-crud.patch
node --test controller/integration-crud.test.js controller/integration-controller.test.js
systemctl restart mailshot-ui && systemctl is-active mailshot-ui
# Hub (on prod, in the www.tensology.com checkout that serves the API): back up, apply
#   tensology-hub-mail-crud.patch with -p1 from the repo root, then reload the hub app server.
# Then add "mail.manage" to the DecisionsAI credential's scopes in the Tensology admin.
```
Rollback: restore the `.bak-20261022` files and restart again. Commit through the normal git flow afterwards
(prod deploy runs `git pull` on main, so uncommitted edits would block or be overwritten).
