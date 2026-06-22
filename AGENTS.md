# Mailshot Agent Instructions

@/Users/paul/.codex/RTK.md

## Git Publishing

- When making project changes, check `git status` and `git remote -v` before committing.
- Commit only the files that belong to the current task; leave unrelated local work untouched.
- After a successful commit, push the completed work to every configured project remote that is meant to receive this codebase.
- If remotes intentionally have different histories or publication scopes, preserve those scopes and push the equivalent safe change to each appropriate remote separately.
- Never commit or push `.env`, `auth.config.json`, private keys, API keys, tokens, or server-local deployment secrets.
