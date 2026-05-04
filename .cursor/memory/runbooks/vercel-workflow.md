# Domain: Vercel — deploy and Git workflow (cc-rostering)

## Purpose

Give agents a short, repeatable picture of how **repo changes** become **Vercel deployments** and how to operate the **CLI** (and optionally **MCP**) from this workspace.

## Paths / artifacts

- Repo root: `/Users/agent-os/cc-rostering` (Next.js `package.json` scripts: `dev`, `build`, `start`).
- Optional linkage: `.vercel/` after `vercel link` (confirm gitignore before committing).
- Long-form: `.agents/VERCEL_AGENT_HANDOVER.md`

## Procedure summary

### Git → Vercel (usual)

1. Connect GitHub/GitLab/Bitbucket repo to the Vercel Project (dashboard).  
2. `git push` to default branch → Production build; other branches/PRs → Preview.  
3. Fix build/env in repo or dashboard env vars; push again to redeploy.

### CLI from repo root

1. `vercel login` if needed.  
2. `vercel link` (once per clone).  
3. `vercel` (preview) or `vercel --prod` (production).  
4. `vercel env pull .env.local` when local dev needs production-like env **names** (user handles secrets).

### This environment

- Use **terminal** with `npx vercel ...` when global CLI absent.  
- **Vercel MCP:** authenticate `plugin-vercel-vercel` (`mcp_auth`); if unavailable, use CLI.

## Validation

- Deployment appears in Vercel dashboard with expected commit or CLI upload.  
- `npm run build` succeeds locally when debugging Vercel build failures.

## Related

- `.agents/VERCEL_AGENT_HANDOVER.md`
- `.cursor/TOOLS.md`, `.cursor/skills/vercel-deploy-workflow/SKILL.md`, `.cursor/memory/MEMORY.md`

---
