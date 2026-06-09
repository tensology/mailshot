#!/usr/bin/env bash
# Deploy Mailshot on the server.
#
# HARD RULES — DO NOT VIOLATE:
# - Never run git reset --hard
# - Never write, copy, restore, sed, or edit .env or auth.config.json
# - Never commit .env or auth.config.json
# - These files are server-local secrets only

set -euo pipefail

APP_DIR="${1:-/root/repos/mailshot-app}"
ENV_FILE="$APP_DIR/.env"
AUTH_FILE="$APP_DIR/auth.config.json"

cd "$APP_DIR"

if git ls-files --error-unmatch .env &>/dev/null; then
    echo "ERROR: .env is tracked in git. Remove it from the repo before deploying."
    exit 1
fi

if git ls-files --error-unmatch auth.config.json &>/dev/null; then
    echo "ERROR: auth.config.json is tracked in git. Remove it from the repo before deploying."
    exit 1
fi

env_hash_before=""
if [ -f "$ENV_FILE" ]; then
    env_hash_before=$(sha256sum "$ENV_FILE" | awk '{print $1}')
fi

auth_hash_before=""
if [ -f "$AUTH_FILE" ]; then
    auth_hash_before=$(sha256sum "$AUTH_FILE" | awk '{print $1}')
fi

# Rebuilt artifacts may differ locally; reset only tracked build output, never secrets.
git checkout -- client/build 2>/dev/null || true

git pull origin main

if [ -f "$ENV_FILE" ] && [ -n "$env_hash_before" ]; then
    env_hash_after=$(sha256sum "$ENV_FILE" | awk '{print $1}')
    if [ "$env_hash_before" != "$env_hash_after" ]; then
        echo "ERROR: .env changed during deploy. This script never modifies secrets — investigate git pull output."
        exit 1
    fi
fi

if [ -f "$AUTH_FILE" ] && [ -n "$auth_hash_before" ]; then
    auth_hash_after=$(sha256sum "$AUTH_FILE" | awk '{print $1}')
    if [ "$auth_hash_before" != "$auth_hash_after" ]; then
        echo "ERROR: auth.config.json changed during deploy. This script never modifies secrets — investigate git pull output."
        exit 1
    fi
fi

npm install
cd client
npm install
npm run build
cd "$APP_DIR"

systemctl restart mailshot-ui
systemctl is-active mailshot-ui

echo "Deploy complete. .env and auth.config.json were not modified."
