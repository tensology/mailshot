# MailShot MCP server

`mailshot_mcp.py` is a standalone stdio MCP server that lets Cursor / Codex
list, search, read, draft, label and trash Tensology mail through the
[Tensology integration API](../docs/API.md). It is **read/draft only** — it
deliberately exposes **no send tool**.

It ships with the MailShot repo so anyone working on or alongside MailShot can
register the same server. It is Python stdlib only; no dependencies.

## Register it globally

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mailshot": {
      "command": "/opt/homebrew/bin/python3",
      "args": ["/Users/paul/development/TENSOLOGY/DONE/mailshot/mcp/mailshot_mcp.py"],
      "env": { "MAILSHOT_API_BASE": "https://www.tensology.com/api/integrations/v1" }
    }
  }
}
```

`~/.codex/config.toml`:

```toml
[mcp_servers.mailshot]
command = "/opt/homebrew/bin/python3"
args = ["/Users/paul/development/TENSOLOGY/DONE/mailshot/mcp/mailshot_mcp.py"]
env_vars = ["TENSOLOGY_MAIL_API_KEY"]
```

Point `args[0]` at this file wherever the repo is checked out.

## Config

- `MAILSHOT_API_BASE` — default `https://www.tensology.com/api/integrations/v1`.
- Key resolution, in order: `TENSOLOGY_MAIL_API_KEY` → `MAILSHOT_MCP_TOKEN_FILE`
  (default `~/.config/mailshot-mcp/token`, chmod 600) → DecisionsAI's own
  encrypted key, read at runtime from its `settings.db`. The key is never
  logged or returned.

Full operation list, scopes and write-abouts: [`../docs/API.md`](../docs/API.md).

## patches/

Historical deployment patches and a hub test helper from the 2026-10-22 mail
CRUD work:

- `mailshot-integration-crud.patch` — the MailShot-side routes are already
  committed in this repo (see `controller/integration-controller.js`,
  `routes/integration-route.js`); kept as a record.
- `tensology-hub-mail-crud.patch`, `add_hub_404_tests.py` — these target the
  **hub** repo (`www.tensology.com` → `backend/webapp/apps/integrations/`),
  not MailShot.
