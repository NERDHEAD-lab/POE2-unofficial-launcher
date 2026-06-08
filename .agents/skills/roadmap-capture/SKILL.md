---
name: roadmap-capture
description: Use when a user says a feature, bug fix, experiment, or follow-up can wait, should be done later, belongs on the roadmap/backlog, or asks to add/update Roadmap items. Ask for priority when missing, update docs/Roadmap.md as the source of truth, add docs/roadmap refs when useful, and validate issue/notice generation.
---

# Skill: Roadmap Capture

## Instructions

Use this skill when a development discussion produces deferred work such as
"나중에 하자", "추후", "로드맵에 넣자", "backlog", or "TODO로 남기자".

1. Capture the deferred item in plain user-facing wording.
2. If the user did not specify priority, ask for one priority before editing:
   `P0` stability/operation, `P1` execution/notification/update, `P2` user-facing expansion, or `P3` long-term review.
3. Update `docs/Roadmap.md`; this is the single source of truth.
4. Add the item under the selected priority as a checklist entry.
5. If the item needs more than one sentence of detail, create or update
   `docs/roadmap/<kebab-case-topic>.md` and append
   `([ref](roadmap/<kebab-case-topic>.md))` to the checklist item.
6. Do not manually edit GitHub Issue #7. The sync workflow strips `ref` links
   and pushes the checklist-only body.
7. Do not manually edit the `gh-pages` notice files. The notice workflow builds
   `notice/[notice]roadmap.md` from `docs/Roadmap.md`.
8. For completed roadmap work, move the checked item to the `완료됨` section
   instead of leaving it in its old priority bucket.

## Validation

After editing Roadmap content, validate the generated outputs:

```bash
npm run roadmap:issue-body
npm run roadmap:notice
```

In this Windows-first repo, run npm scripts from Windows PowerShell as described
in `AGENTS.md`.

## Examples

- User: "자동화 실패 판정은 나중에 하자"
  - Ask for priority if missing.
  - Add a checklist item under the selected priority.
  - Create a detail ref only if the discussion includes enough policy or design
    detail to preserve.
- User: "이건 P1로 로드맵에 넣어"
  - Add it directly under `## P1 - 실행, 알림, 업데이트`.
