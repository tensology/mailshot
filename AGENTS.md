# Mailshot Agent Instructions

@/Users/paul/.codex/RTK.md

## Production Is the Acceptance Environment

- Mailshot only works fully on production. Local builds, fixtures, and tests are supporting checks, not final acceptance.
- For every completed project change, commit the task files on `main`, push to all appropriate project remotes, and deploy to production without asking for deployment permission again. Paul has given standing authorization for this workflow.
- Pushing `main` to `origin` (`root@tensology.com:~/repos/mailshot.git`) runs the existing deployment hook for `/var/www/mailshot.tensology.com`. Use that deployment path, not the legacy deployment script or another checkout.
- Verify the deployed revision, service health, and actual affected flows at `https://mailshot.tensology.com`. For UI changes, inspect the final production screens at desktop and mobile sizes.
- Do not report a change complete while it is only local. If deployment or live verification fails, diagnose and fix it, or clearly report the blocker and what remains unverified.
- Production content protection and secret-handling rules still apply. Deployment authorization does not authorize overwriting production-edited content or sending/deleting real mail for tests.

## Git Publishing

- When making project changes, check `git status` and `git remote -v` before committing.
- Commit only the files that belong to the current task; leave unrelated local work untouched.
- After a successful commit, push the completed work to every configured project remote that is meant to receive this codebase.
- If remotes intentionally have different histories or publication scopes, preserve those scopes and push the equivalent safe change to each appropriate remote separately.
- Never commit or push `.env`, `auth.config.json`, private keys, API keys, tokens, or server-local deployment secrets.
