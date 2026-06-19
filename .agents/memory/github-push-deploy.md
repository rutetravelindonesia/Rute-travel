---
name: GitHub push / deploy flow
description: How to push Replit code to GitHub for this repo (Railway auto-deploys from GitHub) when the Replit Git GUI and shell have no push credentials.
---

# Deploy flow: Replit → GitHub → Railway

Production deploy path: push to GitHub `rutetravelindonesia/Rute-travel` (default branch `main`) → Railway auto-builds and deploys. Replit Deployments are NOT used for prod; Railway is.

## The blocker (non-obvious)

- The Replit **Git GUI** cannot push here: histories diverged (Replit "Initial commit" vs the repo's older history), so a normal push fails with `BRANCH_ALREADY_EXISTS`, and forcing via the GUI throws a generic `Unknown Git Error`. Mobile Git GUI has no force-push control at all.
- Neither the **agent shell** nor the **user's interactive shell** has GitHub push credentials by default: `credential.helper=none`, no token in the remote URL, and GitHub rejects password auth (`Password authentication is not supported`).
- The agent **cannot push itself**: main-agent bash blocks destructive git (push/force), and `process.env` is not accessible inside the `code_execution` sandbox, so the agent can't read a stored token to push via API either.

## The working solution

1. User creates a GitHub **classic PAT** with the `repo` scope.
2. Store it as a Replit secret `GH_PAT` (via `requestEnvVar`).
3. User runs this in a **fresh Shell tab** (fresh so the secret is loaded). The inline credential helper keeps the token out of the visible command / screenshots, and the clean remote URL keeps it out of git's output:

   ```
   git -c credential.helper='!f() { echo username=x-access-token; echo "password=$GH_PAT"; }; f' push -f https://github.com/rutetravelindonesia/Rute-travel.git HEAD:main
   ```

   Verify the secret is loaded first with `echo ${GH_PAT:+TOKEN_OK}` (prints `TOKEN_OK`, never the value).

**Why force push is safe here:** verified file-by-file (GitHub API + blob SHA compare) that local is a strict superset of GitHub `main` — 0 files would be lost, only our edits + new files added.

**Why:** GitHub OAuth from the Replit Git connection lives only in the Replit UI platform layer; it is never exposed to git config, the shell, or background tasks. A PAT is the only credential the shell can use.
