---
name: map.single-task-feature
description: This skill should be used when a Feature should be implemented as exactly one Task, directly on the Feature's own branch, instead of the standard wtf decomposition into multiple Tasks each on their own task/* branch — for example "do this feature as one task", "skip the task branch for this feature", "implement feature #X as a single task", "no separate task branch for this one". This is a deliberate, per-Feature choice, not a standing default — invoke it explicitly for each Feature it applies to, when the Feature's Acceptance Criteria form one tightly-coupled vertical slice that doesn't benefit from being split.
---

# Single-Task Feature

Mapping Assistant-specific override of the standard wtf Feature → many Tasks → separate `task/*` branches decomposition. Core value: keeps this an explicit, per-Feature choice made in the conversation each time, instead of a silent, standing change to how every Feature in the repo gets planned.

## When to use vs. when not to use

**Use when:** the Feature's Acceptance Criteria describe one tightly-coupled vertical slice where splitting it into multiple Tasks would only separate parts of the same change (no meaningful earlier release point between the ACs), and coordinating multiple small Task branches/PRs would add more review friction than value at this scale.

**Do not use when:** the Feature has ACs that are genuinely independent and could ship on different timelines, or is large enough that the Task-level split signals in `../references/scope-gates.md` would fire even on a single combined Task — use the standard `wtf.write-task` / `wtf.feature-to-tasks` flow instead.

## Process

### 1. Identify the Feature

If a Feature number was passed in, use it directly. Otherwise call `AskUserQuestion` (per `../references/questioning-style.md`):
- question: "Which Feature should be implemented as a single Task?"
- header: "Feature"
- options: from recent open issues labeled `feature`

Check for existing sub-issues via `gh sub-issue list <feature_number>` per the cookbook in `../references/gh-setup.md`. If Tasks already exist under this Feature, stop and ask whether to proceed anyway — this skill is for starting a Feature's task planning from zero, not for retrofitting one that's already been decomposed.

### 2. Write the single Task

Invoke `wtf.write-task`, passing the Feature number in as context along with this explicit instruction: "Create a single Task covering the whole Feature's functionality — combine every Acceptance Criterion into one Task rather than the standard multi-task decomposition. This Task will be implemented directly on the Feature's own branch (no separate task/* branch)." Skip `wtf.write-task`'s own Stage 2 scope gate (`../references/scope-gates.md`) for this Task — the single-Task shape is the deliberate point of invoking this skill, not something to re-litigate per Task.

### 3. Implement on the Feature branch

When following `wtf.implement-task` for this Task, skip the "Task branch — create or resume" step of `../references/branch-setup.md` entirely. Work directly on the Feature's `feature/<feature-number>-<feature-slug>` branch (create-or-checkout that branch per the same reference, then stop there — no `task/*` branch on top of it).

### 4. Open one PR for the Feature

When following `wtf.create-pr`, target `main` (not a parent feature branch — there is no task branch to target from), and include both closure keywords in the PR body on their own lines: `Closes #<task_number>` and `Closes #<feature_number>`.

### 5. Report

Print a short summary: which Feature, which Task was created, and the branch being worked on — so it's visible in the conversation that this Feature deliberately took the single-Task path, and why.
