---
name: map.implement-feature-with-single-task
description: This is the Mapping Assistant's default way to plan and implement a Feature — use it whenever a Feature is ready to move from planning into implementation, in place of wtf.write-task's standard multi-task decomposition or wtf.feature-to-tasks. Triggers on anything that would normally reach for those wtf skills in this repo — "plan feature #X", "write the task for this feature", "break this feature down", "implement feature #X", "what's next for this feature". Always collapses a Feature into exactly one Task on the Feature's own branch, regardless of feature size.
---

# Single-Task Feature

Mapping Assistant's standard replacement for the generic wtf Feature → many Tasks → separate `task/*` branches decomposition. In practice, splitting a Feature into several Task issues and branches added coordination overhead without improving how well the implementation turned out — the Feature's own Acceptance Criteria and Gherkin already carry enough structure. So this repo always plans a Feature as exactly one Task, worked directly on the Feature's branch, no matter how large or multi-part the Feature is.

This lives as its own `map.*` skill — not as `CLAUDE.md` prose — so the override stays visible and traceable in the skill system rather than silently reshaping every `wtf.*` skill run from outside it.

## Process

### 1. Identify the Feature

If a Feature number was passed in, use it directly. Otherwise call `AskUserQuestion` (per `../references/questioning-style.md`):
- question: "Which Feature should be implemented as a single Task?"
- header: "Feature"
- options: from recent open issues labeled `feature`

Check for existing sub-issues via `gh sub-issue list <feature_number>` per the cookbook in `../references/gh-setup.md`. If Tasks already exist under this Feature, stop and ask whether to proceed anyway — this skill is for starting a Feature's task planning from zero, not for retrofitting one that's already been decomposed.

Record whether any **open** sibling Task was found at this step (`sibling_tasks_open: true/false`) — step 4 needs this to decide whether merging this Task's PR is also allowed to close the Feature.

### 2. Write the single Task

Invoke `wtf.write-task`, passing the Feature number in as context along with this explicit instruction: "Create a single Task covering the whole Feature's functionality — combine every Acceptance Criterion into one Task rather than the standard multi-task decomposition. This Task will be implemented directly on the Feature's own branch (no separate task/* branch)." Skip `wtf.write-task`'s own Stage 2 scope gate (`../references/scope-gates.md`) for this Task — the single-Task shape is the deliberate point of invoking this skill, not something to re-litigate per Task.

### 3. Implement on the Feature branch

When following `wtf.implement-task` for this Task, skip the "Task branch — create or resume" step of `../references/branch-setup.md` entirely. Work directly on the Feature's `feature/<feature-number>-<feature-slug>` branch (create-or-checkout that branch per the same reference, then stop there — no `task/*` branch on top of it).

### 4. Open one PR for the Feature

When following `wtf.create-pr`, target `main` (not a parent feature branch — there is no task branch to target from), and include `Closes #<task_number>` in the PR body on its own line.

Add `Closes #<feature_number>` on its own line too **only if `sibling_tasks_open` was `false`** in step 1 — i.e. this Task is the only one under the Feature, so finishing it means the Feature itself is done. If `sibling_tasks_open` was `true` (the existing-Tasks gate was overridden in step 1), omit it: other open Tasks still exist under this Feature, and merging this PR must not auto-close it out from under them. In that case the Feature closes later, from whichever PR turns out to be the last one merged.

### 5. Report

Print a short summary: which Feature, which Task was created, and the branch being worked on — so it's visible in the conversation that this Feature deliberately took the single-Task path, and why.
