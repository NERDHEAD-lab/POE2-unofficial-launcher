---
name: pob-integration-workflow
description: Use for PoB integration PR work in this repo, especially PR-6+ Tree/Items/Skills/Calcs/Config tabs, PoB Lua original parity, current-plan driven execution, Windows pwsh validation, and commit hygiene.
---

# PoB Integration Workflow

Use this skill whenever modifying or reviewing the launcher PoB integration. It complements pob-repoe-data: use this skill for PR workflow, original-PoB parity, contracts, UI behavior, tests, and commits; use pob-repoe-data for RePoE cache and translation mapping.

## Required Inputs

1. Read docs/current-plan.md first when present.
2. Read docs/pob-handoff.md and the active docs/plan/PR-*.md.
3. For PoB-original behavior, inspect the matching Lua source under D:\project_poe2\PathOfBuilding-PoE2-KR\src\Modules\*.lua. Prefer rg and small slices over whole-file reads.

## Non-Negotiables

- Keep plan docs unstaged and uncommitted: docs/current-plan.md, docs/pob-handoff.md, docs/plan/PR-*.md.
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

Break large PRs into small sub-steps. After each code sub-step, validate and commit only code changes.

## Long-Running Continuation

- Treat `docs/current-plan.md` as the active queue when present. Keep it concise, current, and unstaged unless the user explicitly asks to commit planning artifacts.
- For PR-ELSE through PR-10R style work, close each sub-step with commit hash, validation result, and remaining decisions in `docs/pob-handoff.md`.
- If independent-context subagents are available, use them for isolated source analysis, regression review, or UI parity checks. Give them only the task-local repo paths and question; reconcile their findings in the main context.
- If subagents are unavailable or not worth the overhead, rely on `docs/current-plan.md`, `docs/pob-handoff.md`, and the active `docs/plan/PR-*.md` as the resumable context boundary.
- Do not continue from memory when resuming after compaction. Re-read the current plan, handoff, and the affected code slice before editing.

## Validation And Commit

Run validation through Windows PowerShell from the repo root:

    cd D:\project_poe2\POE2-unofficial-launcher
    npm run lint
    npm test
    npm run build:check

Commit through Windows PowerShell too, because pre-commit hooks run there. Stage only code/resource/test files for the sub-step; leave plan docs unstaged.

For PoB integration commits, include a concise commit body that summarizes the actual work and validation. Do not add AI attribution trailers.

## PoB Original Contracts

- Add shared interfaces or literal unions for Tree, Items, Skills, Calcs, and Config option values before wiring UI that consumes them.
- Add tests that compare runtime snapshots against PoB Lua-derived structures, not just TypeScript compile checks.
- Use real fixture coverage when available. For imported-build regressions, prefer the Imported Build2 fixture copied into test resources and assert exact labels/options where prior parser drift was seen.
- Treat blank strings, -, -%, and - to - as distinct display states. Do not normalize PoB intentional blanks into placeholder text unless the original does.

## UI Rules

- Keep PoB controls one-to-one with the original, while improving layout for scanning.
- Preserve category/filter boundaries when adding favorites or reordering.
- For masonry/card layouts, keep source order stable while balancing collapsed/expanded column height as much as possible.
