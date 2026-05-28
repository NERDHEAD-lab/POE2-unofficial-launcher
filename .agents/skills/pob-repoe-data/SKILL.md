---
name: pob-repoe-data
description: Map Path of Exile 2 RePoE JSON data into PoB i18n cache and translator contracts. Use when working on PR-7+ RePoE fetch/cache/translation tasks, tree node localization, stat translation templates, unique/item/gem name mapping, or Korean/English game-data replacement for the PoB integration.
---

# RePoE Data Mapping

Use this skill for PoE2 RePoE cache, translator, and data-shape work. Keep UI i18n separate from game data: never add item names, stat lines, passive node text, or gem names to `src/pob/i18n/*.json`.

## Workflow

1. Read `docs/pob-handoff.md`, `docs/pob-integration-plan.md`, and the active `docs/plan/PR-*.md`.
2. Verify CDN baseline before relying on RePoE paths:
   - `https://repoe-fork.github.io/poe2/version.txt`
   - `https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json`
   - `https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json`
   - `https://ggpk.exposed/version?poe=2`
3. Fetch/cache source JSON in service code, not renderer code. Preferred boundary:
   - `src/main/services/pobRepoe/*` for network/cache/translator logic
   - `src/shared/*` for serializable contracts and pure types
   - `src/pob/*` for display-only UI integration
4. Preserve PoB compatibility. Send PoB Lua original IDs/English identifiers back to Lua; translate only displayed text unless a PR explicitly implements reverse parsing.
5. On cache miss or unmapped value, return the original PoB text/ID.

## Data Map

Read `references/poe2-repoe-map.md` for the known PoE2 RePoE paths, schemas, and mapping rules.
