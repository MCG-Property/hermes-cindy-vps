# SKILLS.md

This file is the **high-level registry** of repeatable procedures for this workspace. Full procedure text, frontmatter, and skill-specific **assets** / **references** live under **`.cursor/skills/<skill-id>/`** (same idea as **`.agents/skills/<name>/`**).

It is distinct from runbooks.

- **`.cursor/SKILLS.md`** (this file) = index + rules for what counts as a skill and how to register one.
- **`.cursor/skills/<skill-id>/SKILL.md`** = canonical body for that skill (YAML frontmatter + sections).
- **`assets/`** = templates, checklists, or attachments for that skill only.
- **`references/`** = short pointers to handovers, upstream skills, docs, or runbooks (avoid duplicating long docs).
- `memory/runbooks/` = exact historical records of how a specific run was executed in practice.

## Purpose

Use the skills system for procedures that are:

- repeatable
- durable
- multi-step
- outcome-stable
- useful across future tasks
- not tied only to one historical incident

Do not use it for:

- one-off problem histories → `memory/runbooks/`
- unresolved blocker tracking → `memory/blockers/`
- live current work → `STATE.md`
- durable user preferences → `USER.md`
- primary working memory / continuation log → **`.cursor/memory/MEMORY.md`**

---

## Layout (mirror of `.agents/skills/`)

For each skill, maintain a directory:

```text
.cursor/skills/<skill-id>/
  SKILL.md           # required: metadata + full procedure
  assets/            # optional: templates, snippets
  references/        # optional: links to .agents handovers, upstream SKILL.md, URLs
```

**Naming:** use **kebab-case** `skill-id` (stable, URL-safe). Example: `supabase-linked-migrations`, `vercel-deploy-workflow`.

When adding a new skill:

1. Create `.cursor/skills/<skill-id>/` with `SKILL.md` using the structure in **Entry format** below.
2. Add `assets/` and/or `references/` as needed.
3. Add a row to **Skill registry** in this file.
4. Update `.cursor/TOOLS.md` if new tools are involved.

---

## Update rules

Update **this registry** and/or a skill folder whenever:

- a new long-standing repeatable process is established
- a multi-step process is stable enough for reuse
- a toolchain pattern should be preserved for future reuse
- the user explicitly requests a skill addition, change, or removal

Remove or revise when:

- the user requests removal
- the procedure is no longer valid
- the tooling has materially changed

---

## Entry format

### In `.cursor/skills/<skill-id>/SKILL.md` (required sections)

Each `SKILL.md` should include YAML frontmatter (`name`, `description`, optional `metadata`) and sections:

- Purpose  
- When to use  
- Inputs  
- Tools used  
- Procedure  
- Expected outcome  
- Validation  
- Failure modes / cautions  
- Related files  

---

## Writing standard

All skill bodies must be:

- concise
- deterministic
- reusable
- easy for the agent to execute
- specific enough to produce the same result again

If a procedure is still experimental or not outcome-stable, keep it in a **runbook** until it can be promoted into `.cursor/skills/<skill-id>/SKILL.md` and listed here.

---

## Skill registry

| ID | One-line purpose | Detail |
|----|------------------|--------|
| `supabase-linked-migrations` | SQL migrations to linked Supabase; local/remote alignment | [SKILL.md](skills/supabase-linked-migrations/SKILL.md) |
| `vercel-deploy-workflow` | Next.js → Vercel via Git or CLI; env; MCP optional | [SKILL.md](skills/vercel-deploy-workflow/SKILL.md) |

---
