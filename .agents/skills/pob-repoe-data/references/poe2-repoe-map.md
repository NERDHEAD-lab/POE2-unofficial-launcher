# PoE2 RePoE Mapping Reference

## Baseline

As of 2026-05-28, the PR-7 baseline URLs returned HTTP 200:

- `https://repoe-fork.github.io/poe2/version.txt`
- `https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json`
- `https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json`
- `https://ggpk.exposed/version?poe=2`

Observed `version.txt`: `4.4.0.14`.

## Directory Shape

Root index: `https://repoe-fork.github.io/poe2/`

Localized data lives under locale folders such as:

- `Korean/`
- `Japanese/`
- `Russian/`
- `Traditional Chinese/`

For PR-7, use English root data plus `Korean/` data first.

## Passive Tree

Paths:

- English: `passive_skill_trees/Default.json`
- Korean: `Korean/passive_skill_trees/Default.json`

Top-level keys observed:

- `art`
- `groups`
- `orbit_radii`
- `passives`
- `roots`
- `skills_per_orbit`
- `title`

Node data is under `passives`, not `nodes`. The English and Korean files had the same passive count in baseline (`4975`). Map by passive id string.

Useful passive fields:

- `id`
- `name`
- `stats`
- `reminder_text`
- `flavour_text`
- `icon`
- `is_notable`
- `is_keystone`
- `is_jewel_socket`
- `is_ascendancy_starting_node`

Mapping rule:

- `translateNodeName(nodeId)` uses `Korean.passives[nodeId].name`, fallback to English/PoB original.
- Passive `stats` are stat ids and values, not fully rendered translated lines. Use stat translation files for display strings.

## Stat Translations

Paths are directories:

- English: `stat_translations/`
- Korean: `Korean/stat_translations/`

Important files visible in the index:

- `stat_descriptions.json`
- `passive_skill_stat_descriptions.json`
- `passive_skill_aura_stat_descriptions.json`
- `skill_stat_descriptions.json`
- `gem_stat_descriptions.json`
- `active_skill_gem_stat_descriptions.json`
- `advanced_mod_stat_descriptions.json`
- `character_panel_stat_descriptions.json`

Mapping rule:

- Match stat ids/templates between English and Korean files.
- Preserve numeric values from PoB/RePoE.
- If template resolution is uncertain, return original PoB line.

## Items, Uniques, Gems, Skills

Root and Korean folders expose parallel JSON files:

- `base_items.json`
- `item_classes.json`
- `mods.json`
- `mods_by_base.json`
- `skill_gems.json`
- `skills.json`
- `uniques.json`

Mapping rules:

- Unique names: prefer stable unique/base ids from JSON over localized display-name matching.
- Base items/classes: map by key/id and fallback to PoB text.
- Gems/skills: map by gem or skill id; do not send localized names back into PoB Lua unless implementing an explicit reverse parser.
- Mods: use stat translation when possible; raw mod text is a later, higher-risk mapping surface.

## Cache Contract Guidance

Suggested manifest fields:

- `last_check_timestamp`
- `active_locale`
- `cached_locales[locale].cached_at`
- `cached_locales[locale].tree_version`
- `cached_locales[locale].version_file_etag`
- `cached_locales[locale].version_file_last_modified`

Use `version.txt` and HTTP validators (`ETag`, `Last-Modified`) when available. Cross-check `ggpk.exposed/version?poe=2` against `version.txt` to avoid partial deployment windows.

## Test Guidance

Automated tests should cover:

- CDN baseline URL construction without duplicating UI strings.
- English/Korean passive id set overlap.
- Cache manifest read/write behavior.
- Translator fallback for missing ids.
- Translator success for at least one fixture id from cached passive tree data.

