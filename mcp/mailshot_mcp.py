#!/usr/bin/env python3
"""Mailshot MCP server (stdio, stdlib only).

Wraps the Tensology integration API (which proxies to Mailshot on the
production server) so Cursor / Codex can list, search, read, draft, label
and delete Tensology mail.  It deliberately exposes NO send tool.

Config (env):
  MAILSHOT_API_BASE        default https://www.tensology.com/api/integrations/v1
  TENSOLOGY_MAIL_API_KEY   bearer key (DecisionsAI-audience Tensology credential)
  MAILSHOT_MCP_TOKEN_FILE  fallback file holding the key (default ~/.config/mailshot-mcp/token)
  (last fallback)          DecisionsAI settings.db tensology_key/tensology_url, decrypted at runtime;
                           MAILSHOT_DECISIONS_DB overrides the DB path, MAILSHOT_USE_DECISIONS_KEY=0 disables
The key is never logged or returned.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

SERVER_NAME = "mailshot"
SERVER_VERSION = "1.0.0"
DEFAULT_BASE = "https://www.tensology.com/api/integrations/v1"


DECISIONS_DB_CANDIDATES = [
    os.environ.get("MAILSHOT_DECISIONS_DB") or "",
    os.path.join(os.environ.get("DECISIONS_DB_DIR") or "", "settings.db") if os.environ.get("DECISIONS_DB_DIR") else "",
    os.path.expanduser("~/development/TENSOLOGY/DECISIONS/DecisionsAI/db/settings.db"),
    os.path.expanduser("~/Library/Application Support/DecisionsAI/db/settings.db"),
]
_ENC_PREFIX = "enc:v1:"


def _decisions_key_candidates():
    """Same key-derivation order DecisionsAI uses (distr/core/utils.py)."""
    import hashlib
    import platform
    home = os.path.expanduser("~")
    materials = [
        (os.environ.get("DECISIONSAI_SETTINGS_SECRET") or "").strip(),
        f"{home}|{platform.node()}|decisionsai-settings",
        (os.environ.get("DECISIONSAI_SETTINGS_LEGACY_SECRET") or "").strip(),
    ]
    legacy_node = (os.environ.get("DECISIONSAI_SETTINGS_LEGACY_NODE") or "").strip()
    if legacy_node:
        materials.append(f"{home}|{legacy_node}|decisionsai-settings")
    materials = [m for m in materials if m]
    return [hashlib.sha256(m.encode("utf-8")).digest() for m in materials]


def _decrypt_decisions_secret(value):
    import base64
    import hashlib
    import hmac
    raw = (value or "").strip()
    if not raw.startswith(_ENC_PREFIX):
        return raw
    payload = base64.urlsafe_b64decode(raw[len(_ENC_PREFIX):].encode("ascii"))
    if len(payload) < 48:
        return ""
    nonce, mac, ciphertext = payload[:16], payload[-32:], payload[16:-32]
    for key in _decisions_key_candidates():
        if hmac.compare_digest(mac, hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()):
            stream = bytearray()
            counter = 0
            while len(stream) < len(ciphertext):
                stream.extend(hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest())
                counter += 1
            return bytes(a ^ b for a, b in zip(ciphertext, stream)).decode("utf-8")
    return ""


def _decisions_settings():
    """Read tensology_* from DecisionsAI's SQLite settings (read-only). Returns (key, url) or ("", "")."""
    import sqlite3
    if (os.environ.get("MAILSHOT_USE_DECISIONS_KEY") or "1").strip().lower() in ("0", "false", "no"):
        return "", ""
    for path in DECISIONS_DB_CANDIDATES:
        if not path or not os.path.isfile(path):
            continue
        try:
            con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
            try:
                row = con.execute("SELECT tensology_enabled, tensology_url, tensology_key FROM settings LIMIT 1").fetchone()
            finally:
                con.close()
        except sqlite3.Error:
            continue
        if not row or not row[2]:
            continue
        key = _decrypt_decisions_secret(row[2])
        if key:
            return key, (row[1] or "").strip()
    return "", ""


def _credentials():
    """Resolve (key, base_url).

    Key order: TENSOLOGY_MAIL_API_KEY env -> MAILSHOT_MCP_TOKEN_FILE / ~/.config/mailshot-mcp/token
    -> DecisionsAI settings.db tensology_key (decrypted at runtime, never copied).
    Base: MAILSHOT_API_BASE env -> DecisionsAI tensology_url + /api/integrations/v1 -> default.
    """
    key = (os.environ.get("TENSOLOGY_MAIL_API_KEY") or "").strip()
    if not key:
        path = os.path.expanduser(os.environ.get("MAILSHOT_MCP_TOKEN_FILE") or "~/.config/mailshot-mcp/token")
        try:
            with open(path, "r", encoding="utf-8") as handle:
                key = handle.read().strip()
        except OSError:
            key = ""
    decisions_key, decisions_url = _decisions_settings()
    if not key:
        key = decisions_key
    base = (os.environ.get("MAILSHOT_API_BASE") or "").strip()
    if not base and decisions_url:
        base = decisions_url.rstrip("/") + "/api/integrations/v1"
    return key, (base or DEFAULT_BASE).rstrip("/")


def _call(method, path, query=None, body=None, mutation=False):
    key, base = _credentials()
    if not key:
        raise RuntimeError("Mailshot MCP has no key: set TENSOLOGY_MAIL_API_KEY, create ~/.config/mailshot-mcp/token (chmod 600), or save a Tensology key in DecisionsAI Settings.")
    url = f"{base}/{path.lstrip('/')}"
    if query:
        clean = {k: v for k, v in query.items() if v not in (None, "")}
        if clean:
            url += "?" + urllib.parse.urlencode(clean, doseq=True)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "X-Request-ID": str(uuid.uuid4()),
        "X-Tensology-Source": "mailshot-mcp",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    if mutation:
        headers["Idempotency-Key"] = f"mailshot-mcp-{uuid.uuid4()}"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            envelope = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8"))
            err = detail.get("error") or {}
            message = err.get("message") if isinstance(err, dict) else str(err)
            code = err.get("code") if isinstance(err, dict) else "http_error"
        except Exception:
            message, code = str(exc), "http_error"
        raise RuntimeError(f"HTTP {exc.code} {code}: {message}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Mailshot API unreachable: {exc.reason}") from None
    if isinstance(envelope, dict) and envelope.get("error"):
        err = envelope["error"]
        raise RuntimeError(err.get("message", "request failed") if isinstance(err, dict) else str(err))
    return envelope.get("data", envelope) if isinstance(envelope, dict) else envelope


def _whoami():
    key, base = _credentials()
    if not key:
        return {"configured": False}
    source = "env" if (os.environ.get("TENSOLOGY_MAIL_API_KEY") or "").strip() else (
        "token_file" if os.path.isfile(os.path.expanduser(os.environ.get("MAILSHOT_MCP_TOKEN_FILE") or "~/.config/mailshot-mcp/token")) else "decisionsai_settings")
    data = _call("POST", "auth/introspect", body={}) or {}
    return {"configured": True, "key_source": source, "base": base,
            "active": data.get("active"), "audience": data.get("audience"), "scopes": data.get("scopes")}


def _draft_body(args):
    body = {}
    for field in ("to", "cc", "bcc", "subject", "text", "html", "inReplyTo", "references"):
        if args.get(field) not in (None, ""):
            body[field] = args[field]
    return body


def _q(value):
    return urllib.parse.quote(str(value), safe="")


STR = {"type": "string"}
INT = {"type": "integer"}
RECIP = {"type": ["string", "array"], "items": {"type": "string"}, "description": "Comma-separated string or list of addresses"}
SECTIONS = ["inbox", "incoming", "sent", "drafts", "archived", "spam", "bin", "trash", "starred", "allmail"]

TOOLS = [
    {"name": "mailshot_whoami",
     "description": "Show the key source in use and the credential's audience/scopes (never the key itself).",
     "inputSchema": {"type": "object", "properties": {}},
     "run": lambda a: _whoami()},
    {"name": "mailshot_list_messages",
     "description": "List mail in a section (inbox/incoming, sent, drafts, archived, spam, bin, starred, allmail), optionally filtered by label/tag, search text, participant or unread. Returns summaries (sender, subject, date, preview). Read-only.",
     "inputSchema": {"type": "object", "properties": {
         "section": {"type": "string", "enum": SECTIONS, "default": "inbox"},
         "label": {"type": "string", "description": "Label/tag slug (works for inbox, sent, drafts, allmail)"},
         "search": STR, "participant": STR, "unread": {"type": "boolean"},
         "page": INT, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}},
     "run": lambda a: _call("GET", "mail/messages", {"folder": {"incoming": "inbox", "trash": "bin"}.get(a.get("section") or "inbox", a.get("section") or "inbox"), "label": a.get("label"), "search": a.get("search"), "participant": a.get("participant"), "unread": "true" if a.get("unread") else None, "page": a.get("page"), "limit": a.get("limit")})},
    {"name": "mailshot_search",
     "description": "Full-text search across the mailbox (needs the 2026-10-22 API patch). Read-only.",
     "inputSchema": {"type": "object", "required": ["q"], "properties": {"q": STR, "page": INT, "limit": INT}},
     "run": lambda a: _call("GET", "mail/search", {"q": a["q"], "page": a.get("page"), "limit": a.get("limit")})},
    {"name": "mailshot_get_message",
     "description": "Read one message in full (note: Mailshot marks it as read). include_thread=true returns the whole conversation.",
     "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": STR, "include_thread": {"type": "boolean"}}},
     "run": lambda a: _call("GET", f"mail/messages/{_q(a['id'])}", {"include_thread": "true" if a.get("include_thread") else None})},
    {"name": "mailshot_list_drafts",
     "description": "List saved drafts. Read-only.",
     "inputSchema": {"type": "object", "properties": {"label": STR, "page": INT, "limit": INT}},
     "run": lambda a: _call("GET", "mail/drafts", {"label": a.get("label"), "page": a.get("page"), "limit": a.get("limit")})},
    {"name": "mailshot_get_draft",
     "description": "Read one draft.",
     "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": STR}},
     "run": lambda a: _call("GET", f"mail/drafts/{_q(a['id'])}")},
    {"name": "mailshot_create_draft",
     "description": "Save a NEW draft in Mailshot. Never sends.",
     "inputSchema": {"type": "object", "properties": {"to": RECIP, "cc": RECIP, "bcc": RECIP, "subject": STR, "text": STR, "html": STR, "inReplyTo": STR, "references": STR}},
     "run": lambda a: _call("POST", "mail/drafts", body=_draft_body(a), mutation=True)},
    {"name": "mailshot_update_draft",
     "description": "Update an existing draft by id. Never sends.",
     "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": STR, "to": RECIP, "cc": RECIP, "bcc": RECIP, "subject": STR, "text": STR, "html": STR}},
     "run": lambda a: _call("PATCH", f"mail/drafts/{_q(a['id'])}", body=_draft_body(a), mutation=True)},
    {"name": "mailshot_delete_draft",
     "description": "Delete ONE draft by id (refuses non-draft records). Needs the 2026-10-22 API patch.",
     "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": STR}},
     "run": lambda a: _call("DELETE", f"mail/drafts/{_q(a['id'])}", mutation=True)},
    {"name": "mailshot_trash_message",
     "description": "Move ONE message to Bin; permanent=true deletes it only if already in Bin. Needs the 2026-10-22 API patch and mail.manage scope.",
     "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": STR, "permanent": {"type": "boolean"}}},
     "run": lambda a: _call("DELETE", f"mail/messages/{_q(a['id'])}", {"permanent": "true" if a.get("permanent") else None}, mutation=True)},
    {"name": "mailshot_list_labels",
     "description": "List Mailshot labels/tags. Needs the 2026-10-22 API patch.",
     "inputSchema": {"type": "object", "properties": {}},
     "run": lambda a: _call("GET", "mail/labels")},
    {"name": "mailshot_set_labels",
     "description": "Replace the labels on ONE message. Needs the 2026-10-22 API patch and mail.manage scope.",
     "inputSchema": {"type": "object", "required": ["id", "labels"], "properties": {"id": STR, "labels": {"type": "array", "items": {"type": "string"}}}},
     "run": lambda a: _call("PUT", f"mail/messages/{_q(a['id'])}/labels", body={"labels": a["labels"]}, mutation=True)},
]
BY_NAME = {tool["name"]: tool for tool in TOOLS}


def _reply(msg_id, result=None, error=None):
    payload = {"jsonrpc": "2.0", "id": msg_id}
    if error is not None:
        payload["error"] = error
    else:
        payload["result"] = result
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def handle(message):
    method = message.get("method")
    msg_id = message.get("id")
    if method == "initialize":
        requested = (message.get("params") or {}).get("protocolVersion") or "2024-11-05"
        return _reply(msg_id, {"protocolVersion": requested, "capabilities": {"tools": {"listChanged": False}},
                               "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION}})
    if msg_id is None:  # notifications
        return None
    if method == "ping":
        return _reply(msg_id, {})
    if method == "tools/list":
        return _reply(msg_id, {"tools": [{k: v for k, v in t.items() if k != "run"} for t in TOOLS]})
    if method == "tools/call":
        params = message.get("params") or {}
        tool = BY_NAME.get(params.get("name"))
        if not tool:
            return _reply(msg_id, error={"code": -32602, "message": f"Unknown tool {params.get('name')}"})
        try:
            data = tool["run"](params.get("arguments") or {})
            return _reply(msg_id, {"content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}], "isError": False})
        except Exception as exc:  # report, never crash the server
            return _reply(msg_id, {"content": [{"type": "text", "text": f"Error: {exc}"}], "isError": True})
    return _reply(msg_id, error={"code": -32601, "message": f"Method not found: {method}"})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        handle(message)


if __name__ == "__main__":
    main()
