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

### 2. Pick the logo and background yourself

List the images and **look at them** (Read the image files). Choose:

- **logo** — the clean season wordmark/logo, ideally a transparent PNG, NOT
  composited on a background.
- **background** — the high-res key art, WITHOUT logo text baked in.

This judgment is yours — there is no reliable filename rule. Note the two paths.

### 3. Stage the theme (script, stage 1)

```bash
python3 .agents/skills/poe-theme-updater/scripts/update_theme.py \
  --game "<poe1|poe2>" \
  --version-id "<version_id>" \
  --season-name "<season_name>" \
  --start-date "<YYYY-MM-DD HH:mm:ss>" \
  --logo ".cache/presskit/<chosen-logo>" \
  --background ".cache/presskit/<chosen-bg>"
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
