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
- **`.cursor/memory/MEMORY.md`** = primary working memory (standing directives + concise index). **Operational continuation** → **`.cursor/memory/memories/YYYY-MM-DD-hermes-continuation.md`**. Prepend new durable index-style items near the top; avoid duplicating content that belongs in `memory/memories/`, `memory/runbooks/`, or `memory/blockers/`
- `memory/memories/` = timestamped detailed project memory records
- `memory/blockers/` = ongoing unresolved issue records
- `memory/blockers-fixed/` = resolved blocker archives
- `memory/runbooks/` = exact how-it-was-done resolution logs by domain

After each turn, update memory deliberately and minimally:

- add new user instructions, preferences, directives, or durable decisions to the top of **`.cursor/memory/MEMORY.md`** (index sections only)
- append operational session notes (deploys, host work, long narratives) to **today’s** **`.cursor/memory/memories/YYYY-MM-DD-hermes-continuation.md`**
- do **not** clutter **`.cursor/memory/MEMORY.md`** with granular project history, attempted fixes, or verbose logs
- detailed project-specific context must go into the appropriate file under **`.cursor/memory/memories/`**
- unresolved issues must go into the appropriate blocker file under `memory/blockers/`
- exact resolution process, files touched, and changes made must go into the appropriate domain runbook in `memory/runbooks/`

If the user gives a new standing rule or persistent operating instruction, reflect it in the appropriate canonical file:

- workflow/agent behavior rule -> `.cursor/AGENTS.md`
- user preference/directive -> `.cursor/USER.md`
- live current task state -> `.cursor/STATE.md`
- durable memory index entry -> **`.cursor/memory/MEMORY.md`**
- new stable repeatable procedure -> `.cursor/skills/<skill-id>/` + registry row in `.cursor/SKILLS.md` (when outcome-stable and reusable; otherwise runbook first)
- tool/capability registry change -> `.cursor/TOOLS.md`

Do not duplicate the same information across files unless needed for navigation. Prefer:

- short index/reference in **`.cursor/memory/MEMORY.md`**
- detail in `memories/`, `blockers/`, `runbooks/`, stable procedures in `.cursor/skills/` (indexed by `SKILLS.md`), and capability listings in `TOOLS.md`

---

## Memory system rules

### A) `.cursor/memory/MEMORY.md`

**`.cursor/memory/MEMORY.md`** must stay high signal: standing directives and concise index sections only. **Operational continuation** (deploys, gateway/SSH, long session notes) goes into **`.cursor/memory/memories/YYYY-MM-DD-hermes-continuation.md`** (one file per UTC day). Do not paste full runbook narratives into either—use `memory/runbooks/` for procedures.

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

When adding durable index-style items to **`.cursor/memory/MEMORY.md`**, prepend new items to the top (below the title / above static sections as appropriate).

---

### B) memories/

Use **`.cursor/memory/memories/`** for timestamped project memory. **Per-day ops:** `YYYY-MM-DD-hermes-continuation.md`. **Ad hoc topics:** `YYYY-MM-DD_HHMM_<topic>.md` when needed.

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

### F) SKILLS.md and `.cursor/skills/`

Use **`.cursor/SKILLS.md`** as the **registry** and **`.cursor/skills/<skill-id>/SKILL.md`** (plus optional `assets/`, `references/`) for full repeatable procedures — same pattern as **`.agents/skills/`**. It is **not** for one-off incident history (that belongs in `memory/runbooks/`). Rules and registry format are defined in `.cursor/SKILLS.md`.

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

Instead, proactively compact context into `STATE.md`, **`.cursor/memory/MEMORY.md`** (index only), **`.cursor/memory/memories/`** (including **`*-hermes-continuation.md`** for dated ops), `blockers/`, and `runbooks/` before loss occurs. Keep `.cursor/SKILLS.md`, `.cursor/skills/`, and `TOOLS.md` updated when reusable procedures or the tool surface materially changes (not for ad hoc session dumps).

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
- do not put runbook-level detail into **`.cursor/memory/MEMORY.md`** (use `memory/runbooks/`)

When solving ongoing project issues:

- consult active blocker files before acting
- consult relevant runbooks before retrying similar fixes
- update the blocker only when the status materially changes
- update the runbook when a repeatable resolution process becomes clearer

When a new persistent instruction from the user appears, operationalize it into the correct file rather than leaving it buried only in chat history.

Favor continuity over re-discovery.

---
