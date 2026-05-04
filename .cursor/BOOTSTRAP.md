# BOOTSTRAP — `.cursor/` configuration tree

This file is **`.cursor/BOOTSTRAP.md`**. It defines the **`.cursor/`** layout: **`rules/`**, **`memory/`**, **`skills/`**, and core markdown files; **idempotent** creation of missing paths; and **what to read** at session start and before each turn (system context only).

---

## 1. Purpose

- **Location:** This specification lives at **`.cursor/BOOTSTRAP.md`**.
- **Scope:** **Only** the **`.cursor/`** directory at the repository root.
- **Materialize:** Create **missing** directories and files from §3 using the appendices **only when the target file or rule does not exist**.
- **Idempotent:** Never overwrite existing `USER.md`, `MEMORY.md`, `STATE.md`, `SKILLS.md`, `TOOLS.md`, `memory/**`, `skills/**`, or `rules/*.mdc` that already contain project context—**skip** and keep on-disk content.
- **Runtime (session start + before every turn):** Load **only** the **system** context defined in `.cursor/AGENTS.md` (read list) and always-on `.cursor/rules/*.mdc`. Do **not** load the full bootstrap appendices each turn; use appendices only when **filling gaps**.
- **Excluded from templates:** Application code, secrets, and non-system narrative.

---

## 2. Preconditions

- Repository root is writable.
- If `.cursor/` already exists, only **add** missing paths; do not delete user data without an explicit reset request.

---

## 3. Target directory tree

Create exactly this structure (empty dirs use `.gitkeep` where noted):

```text
.cursor/
  AGENTS.md
  USER.md
  STATE.md
  SKILLS.md
  TOOLS.md
  skills/                    # may be empty at first; no skill subfolders required for bootstrap
  memory/
    MEMORY.md
    memories/                # .gitkeep if empty
    blockers/                # .gitkeep
    blockers-fixed/          # .gitkeep
    runbooks/                # .gitkeep (optional seed runbook below)
  rules/
    00-read-cursor-context-first.mdc
    root-canonical.mdc
    core-operating-context.mdc
    skills-file.mdc
    tools-file.mdc
    memory-governance.mdc
    blocker-governance.mdc
    runbook-governance.mdc
    state-and-compactification.mdc
```

**Notes**

- **`rules/` (required):** Always-on `.mdc` files including **`00-read-cursor-context-first.mdc`**, **`01-per-turn-read-contract.mdc`**, **`working-memory.mdc`**, **`root-canonical.mdc`**, governance rules; YAML `description` + `alwaysApply: true`.
- **`memory/` (required):** Subdirs `memories/`, `blockers/`, `blockers-fixed/`, `runbooks/` (use `.gitkeep` if empty). Primary working memory file: **`.cursor/memory/MEMORY.md`** (same tree).
- **`skills/` (required directory):** May be empty initially. Each skill: `.cursor/skills/<skill-id>/` with `SKILL.md` and optional `assets/`, `references/`.

---

## 4. Execution steps (materialize **missing** files only)

1. Create any **missing** directories from §3 under `.cursor/` (`memory/…`, `rules/`, `skills/`).
2. **Appendices A–F:** for each target file, if it **does not exist**, write the fenced template; if it **exists**, **skip** (preserve project content).
3. **Appendix G:** for each `.cursor/rules/*.mdc`, create from template **only if missing**.
4. Add `.gitkeep` in empty `memory/*` subdirectories if required by VCS.
5. **Optional:** `memory/runbooks/agent-config-bootstrap.md` (date + note that `.cursor/` was reconciled from `.cursor/BOOTSTRAP.md`).
6. Validate §5.

## 4b. Session start and before every turn

1. **Each new user message** = new obligation: use the **Read** tool on `.cursor/AGENTS.md` and the **`AGENTS.md` read list** before other tools (rules alone are not enough; Cursor does not auto-refresh file contents each message). See `.cursor/rules/00-read-cursor-context-first.mdc` and `01-per-turn-read-contract.mdc`.
2. Apply always-on `.cursor/rules/*.mdc` where the environment loads them.
3. **Do not** load this entire `BOOTSTRAP.md` each turn—only the **live** `.cursor/` files for operational context.

---

## 5. Validation checklist

After materializing missing files, confirm:

- [ ] `.cursor/AGENTS.md` exists and internal paths consistently use `.cursor/`.
- [ ] All eight rule files exist under `.cursor/rules/` and include YAML frontmatter with `alwaysApply: true`.
- [ ] `MEMORY.md`, `STATE.md`, and `USER.md` are non-empty (or were skipped because already present).
- [ ] `SKILLS.md` contains the registry table (may have zero concrete skills).
- [ ] `TOOLS.md` contains the entry format and tool-selection rule; project-specific tools are **not** required for a valid bootstrap.
- [ ] No secrets or environment-specific credentials were introduced.

---

## 6. Other documentation

Optional handovers elsewhere in the repository may be linked from `.cursor/memory/MEMORY.md` or `skills/*/references/`.

---

# Appendices — file bodies (templates)

**Instruction:** After resolving paths to **`.cursor/`**, use fenced blocks **only when creating a missing file**. **Never** overwrite existing project files from an appendix.

## Appendix A — `.cursor/AGENTS.md`

```markdown
# AGENTS.md

You are operating as an agent in a live project workspace. Your behavior must prioritize continuity, traceability, task state retention, concise memory handling, and reliable resolution of ongoing issues.

## Core operating rules

**Each new user message starts a new turn.** Cursor does not automatically reload these files for you; use the **Read** tool after each user message (and after context compaction) before other tools.

Before every turn, read these files if they exist:

- `.cursor/AGENTS.md`
- `.cursor/USER.md`
- `.cursor/STATE.md`
- `.cursor/SKILLS.md`
- `.cursor/TOOLS.md`
- `.cursor/memory/MEMORY.md`
- every currently active file in `.cursor/memory/blockers/`

Treat these files as the canonical operating context for the current workspace:

- `AGENTS.md` = global behavioral and workflow rules
- `USER.md` = user-specific preferences, directives, and standing instructions
- `STATE.md` = live active-state log for current work
- `SKILLS.md` = high-level skill **registry**; detailed procedures live in `.cursor/skills/<skill-id>/` (distinct from runbooks; see `.cursor/SKILLS.md`)
- `TOOLS.md` = registry of tools, capabilities, and resources available in this workspace
- `.cursor/memory/MEMORY.md` = concise long-term memory index only
- `memory/memories/` = timestamped detailed project memory records
- `memory/blockers/` = ongoing unresolved issue records
- `memory/blockers-fixed/` = resolved blocker archives
- `memory/runbooks/` = exact how-it-was-done resolution logs by domain

After each turn, update memory deliberately and minimally:

- add new user instructions, preferences, directives, or durable decisions to the top of `.cursor/memory/MEMORY.md`
- do **not** clutter `MEMORY.md` with granular project history, attempted fixes, or verbose logs
- detailed project-specific context must go into the appropriate timestamped file under `memory/memories/`
- unresolved issues must go into the appropriate blocker file under `memory/blockers/`
- exact resolution process, files touched, and changes made must go into the appropriate domain runbook in `memory/runbooks/`

If the user gives a new standing rule or persistent operating instruction, reflect it in the appropriate canonical file:

- workflow/agent behavior rule -> `.cursor/AGENTS.md`
- user preference/directive -> `.cursor/USER.md`
- live current task state -> `.cursor/STATE.md`
- durable memory index entry -> `.cursor/memory/MEMORY.md`
- new stable repeatable procedure -> `.cursor/skills/<skill-id>/` + registry row in `.cursor/SKILLS.md` (when outcome-stable and reusable; otherwise runbook first)
- tool/capability registry change -> `.cursor/TOOLS.md`

Do not duplicate the same information across files unless needed for navigation. Prefer:

- short index/reference in `MEMORY.md`
- detail in `memories/`, `blockers/`, `runbooks/`, stable procedures in `.cursor/skills/` (indexed by `SKILLS.md`), and capability listings in `TOOLS.md`

---

## Memory system rules

### A) MEMORY.md

`MEMORY.md` must stay short, direct, and high signal.

It should contain only:

- durable user instructions
- durable user preferences
- stable workflow directives
- major pivot decisions
- high-level architecture notes
- references to important dependent files, with paths
- references to relevant detailed memory files where necessary

It must **not** become the canonical source for:

- project execution history
- debug sessions
- chains of attempted fixes
- long solution narratives
- detailed blockers
- detailed file-by-file change logs

When adding to `MEMORY.md`, prepend new items to the top.

---

### B) memories/

Use `memory/memories/` for timestamped project memory files.

Each file should capture concise but complete detail for a specific work topic or session, including when relevant:

- what was being worked on
- context
- processes performed
- protocols followed
- actions taken
- files touched
- blockers found
- blockers resolved
- blockers still persisting
- outcomes
- next relevant state

These files must preserve project continuity, but remain structured and readable.

Filename format:

`YYYY-MM-DD_HHMM_<topic>.md`

---

### C) blockers/

Use `memory/blockers/` for unresolved problems only.

Rules:

- each blocker file must represent one problem domain only
- create a new blocker file when a genuinely new domain of problem arises
- read all active blocker files before every turn
- use them actively to guide future resolution attempts
- only update a blocker file when:
  - the blocker status changes
  - new variables are introduced
  - a new attempted resolution materially affects understanding
  - relevant files, logs, or symptoms change

Each blocker file should contain:

- domain
- start timestamp
- current status
- symptoms
- attempted resolutions
- files touched
- remaining unknowns
- next recommended actions
- criteria for considering it resolved

A blocker file may only be moved to `memory/blockers-fixed/` when the user has verified that the issue is resolved, complete, or no longer relevant.

---

### D) blockers-fixed/

Use `memory/blockers-fixed/` only for blockers verified by the user as resolved or complete.

Do not move unresolved blockers there preemptively.

---

### E) runbooks/

Use `memory/runbooks/` for exact domain-specific resolution records.

A runbook must exist whenever you document **how** a problem was solved or how a process was executed, especially when this includes:

- exact files touched
- exact changes made
- specific commands or procedures used
- exact paths involved
- what worked and why

Rules:

- keep one runbook per problem domain
- store sub-domains as sections inside the same domain runbook
- create a new runbook only when a genuinely new domain arises
- update the existing domain runbook rather than creating duplicates

Each runbook should include:

- domain
- purpose
- exact paths touched
- exact files created/edited/moved/deleted
- exact procedure followed
- exact result
- validation status
- caveats
- related blocker file paths if relevant

---

### F) SKILLS.md and `skills/`

Use **`.cursor/SKILLS.md`** as the **registry** and **`.cursor/skills/<skill-id>/SKILL.md`** (plus optional `assets/`, `references/`) for full repeatable procedures. Workspace-specific procedures belong here; optional alignment with other skill trees in the repo is up to the project. It is **not** for one-off incident history (that belongs in `memory/runbooks/`). Rules and registry format are defined in `.cursor/SKILLS.md`.

---

### G) TOOLS.md

Use `TOOLS.md` for awareness of tools, plugins, integrations, and resources relevant to this workspace so capabilities are not underused. It is **not** for execution logs or live state. Full rules and entry format are defined in `.cursor/TOOLS.md`.

---

## STATE.md rules

`STATE.md` is the live operational state file and must be maintained continuously.

It must capture current active work so that context can be recovered before automatic compactification loses important detail.

Update `STATE.md` whenever there is a material change to:

- active items
- current objective
- files being worked on
- blockers being faced
- attempts already performed
- decisions already made
- current working hypotheses
- next actions

`STATE.md` must always aim to preserve:

- all active items
- all core files still being worked on
- all issues still being faced
- all meaningful processes already attempted
- current best-known state of the work

Keep it concise but complete enough to resume work without re-deriving context.

Required sections in `STATE.md`:

- Current Objective
- Active Items
- Files in Active Use
- Open Blockers
- Attempts Performed
- Current Working State
- Next Actions
- Last Updated

---

## Context compression and compactification rules

Do not wait for automatic compactification to be the first preservation mechanism.

Instead, proactively compact context into `STATE.md`, `MEMORY.md`, `memories/`, `blockers/`, and `runbooks/` before loss occurs. Keep `.cursor/SKILLS.md`, `.cursor/skills/`, and `TOOLS.md` updated when reusable procedures or the tool surface materially changes (not for ad hoc session dumps).

### Trigger for proactive compactification

Perform proactive compactification whenever **any** of the following is true:

- the conversation or task thread is becoming long enough that earlier active details may fall out of immediate context
- multiple files have been touched and the exact touched paths matter
- multiple attempts have been made and prior failed attempts must not be repeated blindly
- several blockers or subproblems are active at once
- a task has evolved materially from its starting scope
- you are about to enter a new phase of work and old state must be preserved
- you estimate the current working context is around 60–70% of practical useful context capacity

Do this **before** automatic compactification would likely occur.

### What must be preserved during compactification

Always retain:

- active items still in flight
- current objective
- files in active use
- exact issue domains still unresolved
- attempts already performed
- results of those attempts
- working hypotheses
- decisions made
- architectural notes that affect current work
- exact references to relevant memory, blocker, and runbook files

### Compression rules

Compression must:

- remove fluff
- remove duplicate narration
- preserve causality
- preserve current state
- preserve failed and successful attempts
- preserve exact file paths when relevant
- preserve unresolved questions
- preserve what not to retry blindly

Do not compress away anything still active or likely to affect the next turns.

---

## Editing behavior rules

Be easy for the agent to follow:

- prefer explicit rules
- prefer structured sections
- prefer stable file roles
- avoid ambiguous storage locations

When updating files, preserve their role boundaries:

- do not put user preferences into `STATE.md` unless needed for immediate live execution
- do not put task logs into `USER.md`
- do not put runbook-level detail into `MEMORY.md`

When solving ongoing project issues:

- consult active blocker files before acting
- consult relevant runbooks before retrying similar fixes
- update the blocker only when the status materially changes
- update the runbook when a repeatable resolution process becomes clearer

When a new persistent instruction from the user appears, operationalize it into the correct file rather than leaving it buried only in chat history.

Favor continuity over re-discovery.

---
```

## Appendix B — `.cursor/USER.md`

```markdown
# USER.md

Store durable user-specific instructions, preferences, and standing directives here.

Include and maintain:

- the user wants instructions preserved faithfully without drifting from their intended wording or meaning
- do not cut anything pertinent to the user’s immediate instructions
- optimize prompts and rules for maximum effectiveness for the agent
- make instructions easier for the agent to understand without weakening specificity
- keep outputs copyable and directly usable
- prefer structured clarity over stylistic flourish
- preserve the user’s operational intent even when improving phrasing
- retain specifics around project memory, blockers, runbooks, and current-state logging
- retain exactness around unresolved issues, files touched, changes made, and processes attempted
- when a user instruction is durable or recurring, store it here
- when a user instruction is live and task-specific, also reflect it in `STATE.md` as needed

Add newly discovered durable preferences to the top of this file.

---
```

## Appendix C — `.cursor/STATE.md`

```markdown
# STATE.md

## Current Objective

- (none — set when work begins)

## Active Items

- None.

## Files in Active Use

- Canonical: `.cursor/AGENTS.md`, `.cursor/USER.md`, `.cursor/STATE.md`, `.cursor/SKILLS.md`, `.cursor/TOOLS.md`, `.cursor/memory/MEMORY.md`

## Open Blockers

- None. Add blocker files under `.cursor/memory/blockers/` when needed.

## Attempts Performed

- None.

## Current Working State

- Bootstrap complete or not yet run.

## Next Actions

- Replace this file’s sections when real work starts.

## Last Updated

- (timestamp added by executing agent)

---
```

## Appendix D — `.cursor/memory/MEMORY.md`

```markdown
# MEMORY.md

This file is a concise long-term memory index only.

Rules:

- prepend new items to the top
- store only durable user instructions, preferences, standing directives, pivot decisions, architecture notes, and references to important dependent files
- do not store verbose project logs here
- do not store blocker narratives here
- do not store runbook-level solution detail here
- for project-specific history use `memory/memories/`
- for unresolved issue tracking use `memory/blockers/`
- for exact solution/process documentation use `memory/runbooks/`
- when referencing dependent detail, include the exact file path

Initial directives (customize after bootstrap):

- Canonical operating context: `.cursor/AGENTS.md`, `.cursor/USER.md`, `.cursor/STATE.md`, `.cursor/SKILLS.md`, `.cursor/TOOLS.md`, `.cursor/memory/MEMORY.md`.
- Read active blocker files in `.cursor/memory/blockers/` before each turn when working on unresolved issues.
- Compact context proactively before automatic compactification risks losing active state.

---
```

## Appendix E — `.cursor/SKILLS.md`

```markdown
# SKILLS.md

This file is the **high-level registry** of repeatable procedures for this workspace. Full procedure text, frontmatter, and skill-specific **assets** / **references** live under **`.cursor/skills/<skill-id>/`** (skills live only under `.cursor/skills/` unless you choose to link elsewhere).

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
- concise long-term memory index → `.cursor/memory/MEMORY.md`

---

## Layout (optional mirror of org-wide skills package)

For each skill, maintain a directory:

```text
.cursor/skills/<skill-id>/
  SKILL.md           # required: metadata + full procedure
  assets/            # optional: templates, snippets
  references/        # optional: links to handovers, upstream SKILL.md, URLs
```

**Naming:** use **kebab-case** `skill-id` (stable, URL-safe). Example: `deploy-staging`, `run-integration-tests`.

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
| *(none yet — add a row when you create the first skill folder under `skills/`)* | | |

---
```

## Appendix F — `.cursor/TOOLS.md`

```markdown
# TOOLS.md

This file is the canonical workspace registry of tools, capabilities, and resources the agent may use or should consider using.

Its purpose is to keep the agent aware of its full available operating surface so it does not underuse available capabilities.

## Purpose

Use this file to list all tools that may be relevant to work in this workspace, including:

- local terminal capabilities
- package managers
- language runtimes
- linters
- formatters
- test runners
- debuggers
- build tools
- deployment tools
- plugins and extensions
- local services
- external integrations
- online documentation sources
- internal reference files
- browser-based tools
- APIs and SDKs
- search tools
- database clients
- infrastructure tooling

This file is for awareness and selection, not for historical execution logging.

Do not use this file for:

- exact historical fixes
- blocker tracking
- session notes
- user preferences
- live task state

---

## Update rules

Update `TOOLS.md` whenever:

- a new tool becomes available in the workspace
- a plugin or extension is installed or removed
- a relevant integration is configured
- a recurring online reference source becomes important
- a terminal command family or utility becomes part of the normal workflow
- the user explicitly requests tool additions or removals

Keep this file current enough that the agent can always reason from the broadest realistic set of available capabilities.

---

## Entry format

### Tool: <name>

**Category**

- terminal / runtime / package manager / linter / formatter / test runner / debugger / plugin / integration / online resource / internal file / service / infrastructure / database / API / other

**Purpose**

- What the tool is for

**When to use**

- Typical triggers or relevant situations

**How to access**

- Command, path, extension name, service location, URL label, or integration point

**Common operations**

- Most relevant commands, actions, or usage patterns

**Constraints**

- Safety limits, permission requirements, environmental assumptions, rate limits, or known caveats

**Related files**

- Exact paths to configs, scripts, wrappers, or reference docs

---

## Tool selection rule

Before defaulting to a narrow approach, consider whether a better tool already exists in:

- the terminal
- installed plugins
- configured integrations
- project scripts
- language-native tooling
- test tooling
- linting / formatting tooling
- internal reference files
- online official documentation

Prefer the most direct, verifiable tool for the task.

Prefer built-in project scripts and official tooling over improvised alternatives when available.

---

*(Add tool entries below using the **Entry format** section when your project’s toolchain is known.)*
```

## Appendix G — Rule files under `.cursor/rules/`

Each file: use the filename in the heading; content is the fenced block.


### G.1 `root-canonical.mdc`

```markdown
---
description: Primary canonical hard directives for this workspace
alwaysApply: true
---

This is the primary canonical rule for the workspace. Treat it as the highest-priority project instruction layer.

Before acting, anchor behavior to these canonical files if they exist:

- `.cursor/AGENTS.md`
- `.cursor/USER.md`
- `.cursor/STATE.md`
- `.cursor/SKILLS.md`
- `.cursor/TOOLS.md`
- `.cursor/memory/MEMORY.md`
- every active file in `.cursor/memory/blockers/`

Core directive:

- preserve continuity
- preserve role boundaries between files
- preserve active state before context loss
- preserve unresolved issue history
- preserve repeatable procedures
- preserve awareness of full available tooling

Canonical file roles:

- `AGENTS.md` = global workflow and behavior rules
- `USER.md` = durable user preferences and standing directives
- `STATE.md` = live active-state log for current work
- `SKILLS.md` = high-level skill registry; detailed procedures in `.cursor/skills/<skill-id>/SKILL.md`
- `TOOLS.md` = canonical registry of available tools, plugins, integrations, commands, and resources
- `.cursor/memory/MEMORY.md` = concise long-term memory index only
- `memory/memories/` = timestamped detailed project memory files
- `memory/blockers/` = unresolved issue files by domain
- `memory/blockers-fixed/` = resolved blocker archives
- `memory/runbooks/` = exact historical how-it-was-done records by domain

Hard directives:

- Do not let important standing instructions remain buried only in chat history.
- Do not blur file boundaries.
- Do not bloat `MEMORY.md` with material that belongs in detailed memory, blocker, runbook, skills, tools, or state files.
- Read active blocker files before acting on ongoing issues.
- Use `.cursor/SKILLS.md` + `.cursor/skills/` for repeatable stable procedures.
- Use `TOOLS.md` to remain aware of the full capability surface.
- Proactively preserve state before context loss.
- Favor continuity over re-discovery.
- Favor explicit structure over implied memory.
- When instructions conflict, preserve the most specific and most recent user instruction unless it violates a higher hard directive already established by the user.

---
```


### G.2 `core-operating-context.mdc`

```markdown
---
description: Core always-on operating context for this workspace
alwaysApply: true
---

Before acting on each turn, treat the following files as the canonical operating context for this workspace if they exist:

- `.cursor/AGENTS.md`
- `.cursor/USER.md`
- `.cursor/STATE.md`
- `.cursor/SKILLS.md`
- `.cursor/TOOLS.md`
- `.cursor/memory/MEMORY.md`
- every active file in `.cursor/memory/blockers/`

Role boundaries are strict:

- `AGENTS.md` = global workflow and behavior rules
- `USER.md` = durable user preferences, directives, and standing instructions
- `STATE.md` = live active-state log for current work
- `SKILLS.md` = high-level skill registry; detailed procedures in `.cursor/skills/<skill-id>/SKILL.md`
- `TOOLS.md` = registry of available tools, capabilities, and resources
- `.cursor/memory/MEMORY.md` = concise long-term memory index only
- `memory/memories/` = timestamped detailed project memory files
- `memory/blockers/` = unresolved issue files by domain
- `memory/blockers-fixed/` = resolved blocker archives
- `memory/runbooks/` = exact domain-specific how-it-was-done records

Do not blur these boundaries.

When the user gives a new persistent instruction:

- workflow or execution rule -> update the canonical behavior files
- user preference or standing directive -> `USER.md`
- live current task state -> `STATE.md`
- durable memory index entry -> `.cursor/memory/MEMORY.md`
- stable repeatable procedure -> `.cursor/skills/<skill-id>/` + `.cursor/SKILLS.md` registry when appropriate
- tool/capability listing change -> `TOOLS.md`

Favor continuity over re-discovery.

Favor explicit structure over implied memory.

Do not let important operating instructions remain buried only in chat history.

---
```


### G.3 `skills-file.mdc`

```markdown
---
description: Activate and maintain SKILLS.md and .cursor/skills/ as the canonical repeatable-procedures system
alwaysApply: true
---

Treat **`.cursor/SKILLS.md`** as the **high-level registry** (index + rules) for durable, repeatable, multi-step procedures.

Treat **`.cursor/skills/<skill-id>/SKILL.md`** as the **full procedure** for each skill, with optional **`assets/`** and **`references/`** subfolders (same layout pattern as **`.agents/skills/`**).

Use this system for:

- stable operational procedures
- repeated workflows
- standard terminal procedures
- plugin usage patterns
- integration routines
- recurring online resource workflows
- reusable multi-step processes

Do not use it for:

- one-off historical fixes (use `memory/runbooks/`)
- blocker tracking
- temporary notes
- live state
- user preferences

Update when:

- a new long-standing repeatable procedure is established (add folder + registry row in `SKILLS.md`)
- a multi-step process is stable enough for reuse
- a toolchain or integration workflow becomes a reusable standard
- the user requests an addition, change, or removal

If a procedure is still too experimental or not yet outcome-stable, keep the history in the relevant runbook instead of promoting it into `.cursor/skills/`.

---
```


### G.4 `tools-file.mdc`

```markdown
---
description: Activate and maintain TOOLS.md as the canonical tool registry
alwaysApply: true
---

Treat `.cursor/TOOLS.md` as the canonical registry of tools, plugins, integrations, commands, services, internal resources, and online resources that may be relevant to work in this workspace.

Before choosing an approach, consider whether the best available tool already exists in:

- the terminal
- project scripts
- runtimes and package managers
- linters / formatters / test runners
- debuggers
- installed plugins or extensions
- configured integrations
- internal workspace files
- official online documentation and reference sources

Update `TOOLS.md` when:

- a new tool becomes available
- a plugin or extension is added or removed
- an integration is configured or removed
- a recurring official reference source becomes important
- the user requests tool additions or removals

Do not use `TOOLS.md` for historical logs or state tracking.

Its purpose is persistent tool awareness and better tool selection.

---
```


### G.5 `memory-governance.mdc`

```markdown
---
description: Persistent memory handling and concise memory indexing
alwaysApply: true
---

After each turn, update memory deliberately and minimally.

`.cursor/memory/MEMORY.md` must remain short, direct, and high signal.

Store in `.cursor/memory/MEMORY.md` only:

- durable user instructions
- durable user preferences
- standing directives
- major pivot decisions
- high-level architecture notes
- references to important dependent files with exact paths

Do not store in `.cursor/memory/MEMORY.md`:

- verbose project logs
- chains of attempted fixes
- blocker narratives
- runbook-level detail
- detailed execution history

When adding a new durable item to `.cursor/memory/MEMORY.md`, prepend it to the top.

Detailed project-specific context belongs in timestamped files under:

- `.cursor/memory/memories/YYYY-MM-DD_HHMM_<topic>.md`

Each memory file should preserve concise but complete continuity for a topic or work session, including when relevant:

- what was being worked on
- context
- processes performed
- protocols followed
- actions taken
- files touched
- blockers found
- blockers resolved
- blockers still persisting
- outcomes
- next relevant state

Do not bloat the main memory file with content that belongs in detailed memory files.

---
```


### G.6 `blocker-governance.mdc`

```markdown
---
description: Ongoing unresolved issue tracking and blocker discipline
alwaysApply: true
---

Use `.cursor/memory/blockers/` only for unresolved problems.

Rules:

- each blocker file must represent one problem domain only
- create a new blocker file when a genuinely new problem domain arises
- read all active blocker files before each turn
- use active blockers to avoid repeating failed attempts blindly
- update a blocker file only when:
  - status changes
  - new variables are introduced
  - a materially relevant new attempt is made
  - relevant files, logs, symptoms, or constraints change

Each blocker file should contain:

- domain
- start timestamp
- current status
- symptoms
- attempted resolutions
- files touched
- remaining unknowns
- next recommended actions
- criteria for considering it resolved

A blocker file may only move to `.cursor/memory/blockers-fixed/` when the user has verified that the issue is resolved, complete, or no longer relevant.

Do not archive unresolved blockers early.

Do not merge unrelated blocker domains into one file.

---
```


### G.7 `runbook-governance.mdc`

```markdown
---
description: Exact resolution logging and repeatable domain runbooks
alwaysApply: true
---

Use `.cursor/memory/runbooks/` for exact domain-specific resolution records.

A runbook must be created or updated whenever you document how something was solved or executed, especially when this includes:

- exact files touched
- exact changes made
- exact paths involved
- specific commands or procedures used
- what worked and why

Runbook rules:

- keep one runbook per problem or process domain
- store sub-domains as sections inside the same domain runbook
- create a new runbook only when a genuinely new domain arises
- update the existing domain runbook rather than creating duplicates

Each runbook should include:

- domain
- purpose
- exact paths touched
- exact files created, edited, moved, or deleted
- exact procedure followed
- exact result
- validation status
- caveats
- related blocker file paths if relevant

If a solution is one-off but exact reproduction matters later, it still belongs in the domain runbook.

If a fix is partial, record that clearly.

If a fix is validated, record how it was validated.

---
```


### G.8 `state-and-compactification.mdc`

```markdown
---
description: Live state preservation and proactive context compactification
alwaysApply: true
---

Maintain `.cursor/STATE.md` as the live operational state file.

Update `STATE.md` whenever there is a material change to:

- current objective
- active items
- files being worked on
- blockers being faced
- attempts already performed
- decisions already made
- current working hypotheses
- next actions

`STATE.md` must preserve enough detail to resume work without re-deriving context.

Required sections:

- Current Objective
- Active Items
- Files in Active Use
- Open Blockers
- Attempts Performed
- Current Working State
- Next Actions
- Last Updated

Do not wait for built-in compactification to be the first preservation mechanism.

Proactively compact context into:

- `STATE.md`
- `.cursor/memory/MEMORY.md`
- `memory/memories/`
- `memory/blockers/`
- `memory/runbooks/`

Update `.cursor/SKILLS.md`, `.cursor/skills/`, and `TOOLS.md` when reusable procedures or the tool surface materially changes, not as scratch logs.

Trigger proactive compactification before context loss whenever any of the following is true:

- the task thread is getting long enough that earlier active details may fall out of working context
- multiple files have been touched and exact touched paths matter
- multiple attempts have been made and failed attempts must not be retried blindly
- several blockers or subproblems are active at once
- the task has materially evolved from its starting scope
- a new phase of work is beginning and prior active state must be preserved
- working context appears roughly 60–70 percent full

During compactification, preserve:

- active items still in flight
- current objective
- files in active use
- unresolved issue domains
- attempts already performed
- results of those attempts
- working hypotheses
- decisions made
- architecture notes affecting current work
- references to relevant memory, blocker, and runbook files

Compression rules:

- remove fluff
- remove duplicate narration
- preserve causality
- preserve current state
- preserve both failed and successful attempts
- preserve exact file paths when relevant
- preserve unresolved questions
- preserve what should not be retried blindly

Do not compress away anything still active or likely to affect the next turns.

---
```


---

## Appendix H — Optional seed runbook

Create `.cursor/memory/runbooks/agent-config-bootstrap.md` with:

- **domain:** agent configuration / bootstrap
- **purpose:** record that `BOOTSTRAP.md` was executed
- **procedure:** link to `.cursor/BOOTSTRAP.md`; note date
- **validation:** tree matches §3

---

## System prompt (short) — for the executing agent

You reconcile **`.cursor/`**: §4 creates **missing** files only; §4b is your **ongoing** read contract. Do not overwrite existing files from appendices. Do not invent secrets.

---

*End of BOOTSTRAP.md*
