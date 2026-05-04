---
name: vercel-deploy-workflow
description: "Deploy Next.js (cc-rostering) to Vercel via Git or CLI; env pull; MCP fallback."
metadata:
  workspace: cc-rostering
  version: "1.0.0"
---

# Skill: Vercel — deploy, Git sync, and local/CLI workflow

## Purpose

- Ship **Next.js** changes to Vercel and keep **dashboard deployments** aligned with **repository** state; use **CLI** or **Git** deliberately.

## When to use

- Deploying cc-rostering; verifying why production differs from local; setting up a new clone with Vercel linkage; pulling env for local development.

## Inputs

- Repo root path; Git remote with access; Vercel account and team; optional `vercel login` session.

## Tools used

- **Git** + Vercel Git integration (push → build), or **Vercel CLI** (`vercel link`, `vercel`, `vercel --prod`).
- **`npm run build`** to validate before deploy.
- **`npx vercel`** when global CLI is not installed.

## Procedure

1. **Prefer Git workflow when the project is Git-connected:** commit and **push** to the branch Vercel tracks; confirm the new deployment in the Vercel dashboard (commit SHA / branch).
2. **CLI preview deploy:** from repo root, `vercel login` if needed, `vercel link` once, then `vercel` for a **Preview** deployment of the current tree.
3. **CLI production deploy:** `vercel --prod` when intentionally deploying from CLI (ensure correct branch/commit and team).
4. **Env for local dev:** `vercel env pull .env.local` after linking (user verifies secrets); align **dashboard env** with what the app expects (`NEXT_PUBLIC_*` only for client-exposed values).
5. **If Vercel MCP is available and authenticated:** optional `deploy_to_vercel` / project queries; otherwise use dashboard + CLI.

## Expected outcome

- A deployment record in Vercel (Preview or Production) that matches the intended commit or local upload; app URL updated per Vercel’s URL rules.

## Validation

- Dashboard shows successful build; preview URL loads; for Git flow, deployment lists the expected **commit**.

## Failure modes / cautions

- **Wrong team/project:** run `vercel whoami` and re-`vercel link`.
- **Uncommitted files:** CLI deploy can include working-tree changes — know what you ship.
- **MCP without auth:** fall back to CLI.

## Related files

- `references/agent-handover.md`
- `.cursor/TOOLS.md` (Vercel CLI + platform)
- `.cursor/memory/runbooks/vercel-workflow.md`
