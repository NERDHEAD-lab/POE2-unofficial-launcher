---
name: pob-integration-workflow
description: Use for PoB integration PR work in this repo, especially PR-11+ residual work, PoB Lua original parity, current-plan driven execution, per-PR branch/squash workflow, Windows pwsh validation, and commit hygiene.
---

# PoB Integration Workflow

Use this skill whenever modifying or reviewing the launcher PoB integration. It complements pob-repoe-data: use this skill for PR workflow, original-PoB parity, contracts, UI behavior, tests, and commits; use pob-repoe-data for RePoE cache and translation mapping.

## Required Inputs

1. Read docs/current-plan.md first when present.
2. Read docs/pob-handoff.md and the active docs/plan/PR-*.md.
3. For PoB-original behavior, inspect the matching Lua source under D:\project_poe2\PathOfBuilding-PoE2-KR\src\Modules\*.lua. Prefer rg and small slices over whole-file reads.
4. Treat docs/pob-completed-work.md and older PR docs as reference-only unless the active handoff/PR document points to them.

## Non-Negotiables

- Keep plan docs unstaged and uncommitted: docs/current-plan.md, docs/pob-handoff.md, docs/plan/PR-*.md.
- Keep docs/pob-completed-work.md and docs/check/** unstaged too unless the user explicitly asks to commit planning/check artifacts.
- Do not add dependencies without asking the user first.
- If a required decision conflicts with plan section 5 or an active PR common principle, stop and ask.
- Preserve PoB original controls and data semantics. UI layout may improve visibility and UX, but references, option values, labels, and unavailable-value rendering must match PoB.
- Do not send translated display text back to Lua when PoB expects original IDs or English identifiers.

## PR Sub-Step Pattern

Use the five-step pattern unless the active plan says otherwise:

1. Read RPC or source snapshot boundary.
2. Add or tighten typed shared contract plus focused tests.
3. Add read-only UI rendering.
4. Add interactions and persistence.
5. Run verification and regression tests.

Break large PRs into small sub-steps. After each code sub-step, validate and commit only code changes on the PR work branch.

## Branch And Squash Workflow

Use this workflow for PR-11+ unless the user gives a different one:

1. Start each PR from the integration branch, currently `feat/next-release`.
2. Create a dedicated work branch for the PR, for example `work/pob-pr-11` or `work/pob-pr-11-tooltips`.
3. Keep sub-step commits on that work branch. Each sub-step commit should include only code/resource/test changes, never planning docs.
4. Update the active PR checklist and handoff as unstaged planning state while working.
5. When the PR is complete, run the required Windows PowerShell validation on the work branch.
6. Switch back to `feat/next-release` and squash the PR branch into one integration commit.
7. Use PR numbering in the squash commit title:

       feat(POB): POB 연동 기능 추가 11 (Imported Build2 parity)

   Use the matching PR number and a short Korean or English scope. Use `fix` or `chore` only when the PR is clearly not a feature.
8. The squash commit body must summarize the actual detailed work in Korean, including the main sub-steps and validation run. Do not add AI attribution trailers.
9. Push only when the user asks. If pushing rewritten history, use `--force-with-lease`.
10. Delete temporary PR work branches only after the squash commit is on `feat/next-release` and the user agrees or cleanup is explicitly requested.

If dirty planning docs block branch switching, back them up as a patch/archive, switch branches, then restore them unstaged.

## Long-Running Continuation

- Treat `docs/current-plan.md` as the active queue when present. Keep it concise, current, and unstaged unless the user explicitly asks to commit planning artifacts.
- For PR-11+ work, close each sub-step with work-branch commit hash, validation result, and remaining decisions in the active PR document and `docs/pob-handoff.md`.
- If independent-context subagents are available, use them for isolated source analysis, regression review, or UI parity checks. Give them only the task-local repo paths and question; reconcile their findings in the main context.
- If subagents are unavailable or not worth the overhead, rely on `docs/current-plan.md`, `docs/pob-handoff.md`, and the active `docs/plan/PR-*.md` as the resumable context boundary.
- Do not continue from memory when resuming after compaction. Re-read the current plan, handoff, and the affected code slice before editing.

## Current Plan Inbox

`docs/current-plan.md` is an unstaged inbox for user feedback that has not been routed yet. It is not the source of truth for PR progress.

- Keep the file terse: only `잔여작업` and `백로그` sections with checklist items.
- Put near-term/actionable items under `잔여작업`; put deferred ideas under `백로그`.
- At session start, read only the unrouted checklist items.
- Route each `잔여작업` item into the active PR checklist or handoff cursor, then remove it from `current-plan`.
- Route each `백로그` item into the appropriate PR/backlog document, usually PR-18 or PR-19, then remove it from `current-plan`.
- Do not store sub-step progress, commit hashes, validation state, or subagent reports in `current-plan`; use handoff plus the active PR `Resume Cursor`.

## Compaction-Safe Progress Tracking

For PR-11+ residual work, minimize resume risk by using document cursors instead of scanning every PR:

1. Read `docs/pob-handoff.md` and find the PR status table. Pick the row with `in-progress`; if none, pick `next`.
2. Open only that active PR document first. Do not traverse all remaining PR docs just to infer progress.
3. Each active PR document must contain `Resume Cursor`, `Context Notes`, `Subagent Reports`, and `Decisions / Risks` sections.
4. `Resume Cursor` is the source of truth for the current sub-step, work branch, last code commit, last validation, and next action.
5. If handoff and the PR cursor disagree, pause code changes and reconcile the two documents first, preferring the more specific cursor with the latest explicit commit/validation entry.
6. After every sub-step, update:
   - the active PR checklist item,
   - the active PR `Resume Cursor`,
   - handoff's one-line PR status row.
7. Subagent findings must be summarized into `Subagent Reports` in the active PR document. Do not rely on subagent conversation memory after compaction.
8. Handoff should not duplicate detailed findings. It only stores the active PR/sub-step pointer, branch, last commit, validation state, blocker, and next action.

## Validation And Commit

Run validation through Windows PowerShell from the repo root:

    cd D:\project_poe2\POE2-unofficial-launcher
    npm run lint
    npm test
    npm run build:check

Commit through Windows PowerShell too, because pre-commit hooks run there. Stage only code/resource/test files for the sub-step or final squash; leave plan docs unstaged.

For work-branch sub-step commits, include a concise body with the actual work and validation. For the final squash commit on `feat/next-release`, include a fuller Korean body that lists the sub-steps completed and the validation commands/results. Do not add AI attribution trailers.

## PoB Original Contracts

- Add shared interfaces or literal unions for Tree, Items, Skills, Calcs, and Config option values before wiring UI that consumes them.
- Add tests that compare runtime snapshots against PoB Lua-derived structures, not just TypeScript compile checks.
- Use real fixture coverage when available. For imported-build regressions, prefer the Imported Build2 fixture copied into test resources and assert exact labels/options where prior parser drift was seen.
- Treat blank strings, -, -%, and - to - as distinct display states. Do not normalize PoB intentional blanks into placeholder text unless the original does.

## UI Rules

- Keep PoB controls one-to-one with the original, while improving layout for scanning.
- Preserve category/filter boundaries when adding favorites or reordering.
- For masonry/card layouts, keep source order stable while balancing collapsed/expanded column height as much as possible.
