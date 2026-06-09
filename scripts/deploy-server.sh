#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/root/repos/mailshot-app}"

cd "$APP_DIR"

# Never use git reset --hard here — it can overwrite tracked secrets files.
git pull origin main

npm install
cd client
npm install
npm run build
cd "$APP_DIR"

systemctl restart mailshot-ui
systemctl is-active mailshot-ui

echo "Deploy complete. Login creds live in auth.config.json and/or .env (both gitignored)."
