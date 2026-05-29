---
name: pob-agent-debugging
description: Use when running the PoB Unofficial Wrapper through the hidden Electron agent harness, attaching Playwright/CDP, collecting renderer console and main process logs, or debugging Passive Tree latency with pob:treePerf.
---

# PoB Agent Debugging

Use this skill for live PoB wrapper automation that must not steal the user's desktop focus.

## Command

Run from Windows PowerShell, not WSL:

```powershell
cd D:\project_poe2\POE2-unofficial-launcher
npm run dev:agent
```

The script starts `npm run dev:agent:app`, sets `POE2_AGENT_MODE=1`, opens Electron with `POE2_AGENT_DEBUG_PORT=9323`, connects Playwright through CDP, enables `localStorage["pob:treePerf"]`, opens the PoB wrapper, selects `Imported Build2`, waits for the passive tree canvas, and writes a combined log under `docs/check/pob-tree-agent-*.log`.

## Workflow

1. Keep `docs/check/**` unstaged unless the user explicitly asks to commit logs.
2. Inspect the generated log for `[pob-tree]` / `[POB_TREE]` lines.
3. Compare stages in this order:
   - `lua:pob.tree.snapshot`
   - `lua:pob.tree.metadata`
   - `ipc:pob:tree-snapshot`
   - `ipc:pob:tree-metadata`
   - `snapshot`
   - `metadata`
   - `resource-manifest`
   - `resource-load`
   - `translate-tree`
   - `project-scene`
   - `canvas-draw`
4. If Lua/IPC snapshot or metadata dominates, prioritize AppData cache/invalidation work.
5. If resource/projection/canvas dominates on tab return or build switch, prioritize static payload, allocation overlay, and keep-alive work.

## Notes

- `POE2_AGENT_BUILD_NAME` overrides the target build name.
- `POE2_AGENT_TIMEOUT_MS` overrides the default 180 second timeout.
- `POE2_AGENT_LOG_FILE` overrides the output log path.
- The harness intentionally hides/focus-skips launcher and PoB windows in agent mode, but still loads real Electron renderer pages through the normal app path.
