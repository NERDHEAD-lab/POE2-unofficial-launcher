---
name: poe-theme-updater
description: Adds or updates a Path of Exile (poe1) or Path of Exile 2 (poe2) season theme for the Unofficial Launcher. Trigger when the user asks to "add a season theme", "update the launcher theme", or "apply a new league background". Given a game + season name/version, it auto-invokes poe-searcher to fetch the press-kit ZIP, the AI picks the logo/background by looking at the images, then a script stages the theme, writes a review doc, and on approval commits straight to gh-pages.
---

# poe-theme-updater

Orchestrator for adding a launcher season theme. The maintainer
(`@NERDHEAD-lab`) is the only reviewer, so there is **no PR**: the change is
staged, shown in a local review doc, and on approval committed directly to
`gh-pages`.

Division of labor:

- **You (the AI)** look at the extracted press-kit images and decide which file
  is the logo and which is the background, then pass those paths to the script.
  When GGG ships the game and league marks as separate official transparent
  assets, you may build a temporary transparent lock-up from those two source
  files; keep the source provenance in the review doc.
- **The script** does everything deterministic: validate, place assets, edit
  `themes.json`, write the review doc, and (on `--approve`) commit + push.

## Repo facts (do not get these wrong)

- `themes.json`, `themes.schema.json`, and `assets/themes/` live on the
  **`gh-pages`** branch. The theme is committed straight onto `gh-pages`.
- `themes.json` is `{ "poe1": [...], "poe2": [...] }`. Each theme:
  `id`, `name`, `assets: {background, logo}`, `startDate` (UTC,
  `YYYY-MM-DD HH:mm:ss`). Optional `endDate`, `isLocalTime`, `assetsHashes`.
- **Never write `assetsHashes`.** The `Update Theme List Hashes` workflow
  (`.github/workflows/automate-theme-list.yml`) computes them on push to
  `gh-pages`.
- `.cache/` is gitignored — press kits are extracted there and the review doc is
  written there, so nothing scratch ever shows up in `git status`.

## Prerequisites

- `gh`/git authenticated, Python 3.
- **Pillow** for the logo transparency check. Install via
  `sudo apt-get install -y python3-pil` (Debian/Ubuntu) or `pip install Pillow`.
  Without it the check is skipped with a warning (the asset still gets applied),
  so the human visual review in step 4 becomes the only guard.
- Start on `gh-pages` with a clean working tree.

## Procedure

### 1. Get the press-kit ZIP and extract it to .cache/

- If the user gave a ZIP/path, use it. Otherwise **invoke [[poe-searcher]]** with
  the game + season name/version. It returns either `PRESSKIT_ZIP=...` (a zip) or
  `PRESSKIT_DIR=...` (a folder it already populated from a Google Drive press kit
  when no direct zip existed), plus `GAME=...`.
- If you got `PRESSKIT_ZIP`, extract it into the ignored scratch dir:

  ```bash
  mkdir -p .cache/presskit
  python3 -c "import zipfile; zipfile.ZipFile('<PRESSKIT_ZIP>').extractall('.cache/presskit')"
  ```

  If you got `PRESSKIT_DIR` instead, the assets are already there — skip the
  extract and pick the logo/background from that dir in step 2.

Confirm metadata: `game`, `version_id`, `season_name`, `start_date` (UTC,
web-search it if unknown).

### 2. Pick the logo (you) and the background (ask the user)

List the images and **look at them** (Read the image files — Read renders them, so
you can actually see each one). There is no reliable filename rule; judge by eye.

**Logo — you pick it.** It has a hard, objective standard, so this is your call,
not the user's. A valid logo is a **transparent-background PNG showing the game
name + season/league name as a free-floating emblem lock-up** — the kind of thing
that reads as "the logo" on its own. Concretely:

- Transparent everywhere around (and _between_) the artwork: all 4 corners
  transparent, the outer edge ≥95% transparent, and the empty areas inside/around
  the letters let a background show through. (`update_theme.py` enforces this; a
  composite fails it.)
- It is an **emblem/wordmark**, not a scene. Reject anything composited on a
  baked background (`Logo_Background.png`-style) or welded into the key art
  (`*_FULL`, `*-with-Logo`). Those have opaque corners and will fail the script.
- Centered, roughly symmetric, tightly cropped. Game title on top, season name
  under it (an April-Fool's theme may swap in a different game's logo by design —
  that's fine).

#### Split official marks: temporary lock-up fallback

If the official kit has a separate transparent game logo and a separate
transparent season/league logo, but no official combined lock-up, do not reject
the release outright and do not invent or download a replacement. Instead:

1. Verify that both files are from the same official GGG press kit or official
   public Drive folder, inspect both images, and keep their original files in
   `.cache/`.
2. Make a temporary transparent composite with the bundled helper, putting the
   season/league mark below the game mark, positioned over the lower ornament
   without changing either source's proportions, matching the existing PoE2
   themes:

   ```bash
   python3 .agents/skills/poe-theme-updater/scripts/compose_logo.py \
     --game-logo ".cache/presskit/<official-game-logo>.png" \
     --league-logo ".cache/presskit/<official-league-logo>.png" \
     --output ".cache/presskit/<version>_temporary_logo.png" \
     --overlap 600
   ```

3. Inspect the composite on a contrasting background. It must remain a single
   transparent PNG with no painted canvas, and both marks must be legible. Pass
   the composite to `update_theme.py` with `--logo-note` stating that it is a
   temporary combination and listing both official source filenames.
   Preserve each official source's proportions; match existing themes by
   adjusting the vertical placement/overlap, not by arbitrarily resizing one
   mark until the overall canvas dimensions look similar.
4. If the placement, overlap, or visual integration is not obvious from the
   existing themes, do not settle on one draft silently. Generate 2–4 `.cache/`
   candidates with the same source dimensions and different placement/overlap
   values. Inspect each candidate individually on a contrasting background,
   then show every candidate in the same Codex conversation with its label,
   filename, pixel dimensions, one-line difference, and a recommendation.
   Ask the maintainer with the structured Codex user-input request and wait for
   the selected candidate before Stage 1. A montage may be included for
   comparison, but it must not be the only preview because candidates can be
   confused when they are bundled into one attachment.
5. Treat it as provisional: every scheduled check must look again for an
   official combined lock-up. If one appears, prepare a replacement review for
   that official asset and explicitly identify that the provisional logo will be
   superseded. Never silently merge an unofficial logo, AI-generated artwork, or
   a baked key-art image.

If either source is not demonstrably official/transparent, or the composite is
visually ambiguous, stop and use the structured Codex user-input request rather
than guessing.

**Background — the user picks it.** Which key art "fits" as the launcher
background is a taste call the maintainer wants to make, and a kit usually ships
several non-interchangeable options (different crops, free-weekend art, with/without
foreground). So do **not** auto-choose:

1. Gather every plausible background — high-res key art **without** the logo baked
   in. Skip tiny promo banners and logo-bearing composites.
2. If there is exactly one, use it. If there are **two or more**, look at each,
   then first post a Korean briefing with inline previews for every candidate.
   Each preview must include the filename, pixel dimensions, one-line visual
   description, and a recommendation. Then ask the maintainer with Codex's
   structured user-input request (`request_user_input` or the app equivalent),
   using one option per candidate, and wait for the selected option. Do not
   replace this with an unstructured text question. Use their choice.
3. Only then do you have both paths for step 3.

Note the chosen logo path and the chosen background path.

### 3. Stage the theme (script, stage 1)

```bash
python3 .agents/skills/poe-theme-updater/scripts/update_theme.py \
  --game "<poe1|poe2>" \
  --version-id "<version_id>" \
  --season-name "<season_name>" \
  --start-date "<YYYY-MM-DD HH:mm:ss>" \
  --logo ".cache/presskit/<chosen-logo>" \
  --background ".cache/presskit/<chosen-bg>" \
  --logo-note "<optional provenance or temporary-composite note>"
```

The script validates the logo's transparency, copies the assets into
`assets/themes/<game>/<version_id>/` (`logo.png` + `bg.<ext>`), upserts
`themes.json`, and writes `.cache/review.md`. **It does not touch git** — only the
working tree gets the asset + `themes.json` changes.

- If the logo transparency check **fails**, the script stops. Pick a better logo,
  or — if you've compared it against the existing themes in
  `assets/themes/` and it's genuinely fine — re-run with `--force-logo`.

### 4. Show the review doc and wait for approval

Open `.cache/review.md` (it embeds the picked assets as local-path images) and
present it to the user. **Wait for an explicit OK.**

- **Rejected?** Go back to step 2, pick different assets, re-run step 3. Nothing
  is committed yet, so this just overwrites the working-tree files — no git
  cleanup needed.

### 5. Approve → commit to gh-pages (script, stage 2)

Only after the user approves:

```bash
python3 .agents/skills/poe-theme-updater/scripts/update_theme.py \
  --game "<poe1|poe2>" --version-id "<version_id>" \
  --season-name "<season_name>" --start-date "<YYYY-MM-DD HH:mm:ss>" --approve
```

This commits `assets/themes/<…>` + `themes.json` onto `gh-pages` as one commit
and pushes. The hash workflow then fills `assetsHashes`. Report the commit to the
user.

### 6. Offer to clean up `.cache/` (don't auto-delete)

The press kit (often tens to hundreds of MB) and the review doc stay in
`.cache/` after the commit. They're gitignored so they never touch `git status`,
but they accumulate on disk season after season. Once the theme is committed and
the assets are safely copied into `assets/themes/<game>/<id>/`, they're no longer
needed.

**Do not delete automatically** — the maintainer may want to re-inspect the kit.
Just point out what's reclaimable and let them decide:

```bash
du -sh .cache/presskit .cache/review.md 2>/dev/null   # show what would be freed
# Only if the user says yes:
rm -rf .cache/presskit .cache/review.md
```

Touch only this skill's own scratch (`presskit/`, `review.md`); leave anything
else in `.cache/` alone.
