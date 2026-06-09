---
name: github-cli-token
description: Use whenever running GitHub CLI (`gh`) or GitHub HTTPS git push from this repo, including PR creation, PR merge, PR checks, issues, Actions, or branch publishing. Enforces repo-local `.env` `GH_TOKEN` injection into the child process without mutating global `gh` auth state.
---

# Skill: GitHub CLI Token

Use this skill before any repo-local `gh` command or GitHub HTTPS push.

## Rules

- Do not run `gh auth switch` or `gh auth login` for repo-local work; those commands mutate shared GitHub CLI state.
- `.env` may contain `GH_TOKEN`, but `gh` does not load `.env` automatically.
- Never print `.env` or token values. Check only whether `GH_TOKEN` exists.
- Pass `GH_TOKEN` into the command environment, not just a shell variable.

Correct:

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')" gh pr view 200
```

Wrong:

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')"; gh pr view 200
```

The wrong form creates a shell variable only. Unless it is exported, the `gh`
child process falls back to global auth and may fail with misleading permission
errors such as `Resource not accessible by personal access token`.

## Common Commands

Create a PR:

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')" gh pr create \
  --base master \
  --head "$(git branch --show-current)" \
  --title "<title>" \
  --body "<body>"
```

Check PR status:

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')" gh pr checks <pr-number> --watch=false
```

Squash merge a PR:

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')" gh pr merge <pr-number> \
  --squash \
  --delete-branch \
  --subject "<commit title>" \
  --body "<commit body>"
```

If `git push` fails because global Git credentials are different from the
repo-local token, inject the token only for that push:

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')"
AUTH_HEADER="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
git -c http.https://github.com/.extraheader="$AUTH_HEADER" push -u origin "$(git branch --show-current)"
unset GH_TOKEN AUTH_HEADER
```

## Diagnostics

To compare auth contexts without changing them:

```bash
gh auth status -h github.com
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2- | tr -d '\r')" gh auth status -h github.com
```

If the inline `GH_TOKEN=... gh ...` form still fails, treat it as a real token
scope or repository permission problem. If only the non-inline form fails, fix
the command invocation before investigating permissions.
