# hermes-sync

Keeps each Hermes box's repos pushed to their remote `main`, and the agent code merged with upstream
(`NousResearch/hermes-agent`), without branches and without ever force-pushing.

| repo kind | what | remote | extras |
|---|---|---|---|
| `agent` | the live code checkout (public repo) | `<box>-public` `main` | secret/size guard, upstream merge, deps, service restart |
| `home` | `$HERMES_HOME` (private repo) | `<box>-private` `main` | runtime churn excluded, full snapshot once a day |

Run: `python scripts/hermes_sync.py run [--repo NAME] [--force] [--no-upstream] [--dry-run]`, `... status`.
Triggers: the `git-autocommit` plugin (session finalize / agent-job completion) and a 15-minute timer
(systemd on the VPSs, launchd on the Mac). Config: `$HERMES_HOME/sync.json`. Log: `$HERMES_HOME/logs/sync.log`.
State: `$HERMES_HOME/sync-status.json`; `$HERMES_HOME/SYNC-NEEDS-ATTENTION.md` exists only while something needs a human.

## Per-run order (per repo)
1. **commit** meaningful changes (waits `min_quiet_s` for files still being written);
2. **upstream** (agent, throttled to `upstream_min_interval_h`): merge `origin/main` in a scratch worktree with rerere,
   verify (py_compile, new undefined names vs pristine upstream, fork tests that fail only when merged), then
   fast-forward the live tree and tag `pre-sync-*` for rollback. Conflict or failed check => live tree untouched,
   attention flag raised, local commits still pushed;
3. **push** `HEAD:main`; if the remote moved, merge it first (never force);
4. **restart** services / rebuild the Desktop app only after code changed and only while the gateway is idle
   (rolls back to the tag if the services come back unhealthy).

Remote layout (all boxes): `origin` = the box's public repo, `upstream` = NousResearch/hermes-agent, live checkout on `main`
tracking `origin/main`; only `main` exists locally and remotely. In this fork layout the native `hermes update` just
fast-forwards `origin` and never resets the carried fork.
