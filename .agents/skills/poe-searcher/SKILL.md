---
name: poe-searcher
description: Finds and downloads the official press-kit ZIP for a Path of Exile (poe1) or Path of Exile 2 (poe2) league/season. Given a season name and/or version, it web-searches for the official press-kit .zip direct link and downloads it to /tmp. Trigger when you need the media assets (logo + background) for a PoE/PoE2 season and only have its name or version. Outputs PRESSKIT_ZIP and GAME for poe-theme-updater to consume.
---

# poe-searcher

Locate and download the **official press-kit ZIP** for a PoE/PoE2 season. The
deliverable is a single `.zip` on local disk plus the game context — nothing
else. Asset _selection_ (which file is the logo vs. background) is done later by
the AI in [[poe-theme-updater]], by looking at the extracted images — not here.

## When to use

- The user wants to add/update a season theme but only gave a season name or version.
- [[poe-theme-updater]] needs assets and no local ZIP/path was provided.

## Inputs

- `game`: `poe1` or `poe2`. If not given, infer from the version id
  (`3.x` → poe1, `0.x` → poe2) or from the season context.
- `season_name` and/or `version_id` (e.g. "Return of the Ancients", `0.5.0`).

## Procedure

### 1. Web-search for the official press-kit .zip

Run `WebSearch` with queries like:

- poe2: `"Path of Exile 2" "<season_name>" press kit zip`
- poe2: `"Path of Exile 2" "<season_name>" media kit download`
- poe1: `"Path of Exile" "<season_name>" press kit zip`

Prefer official / first-party sources:

- **GGG news forum** announcement thread (`pathofexile.com/forum/view-forum/news`)
  or the expansion landing page — the press kit is usually linked near the
  bottom as _"You can download the press kit here."_
- **GamesPress** release page (`site:gamespress.com "Path of Exile"`).
- GGG CDN (`web.poecdn.com/...`) direct `.zip` links.

You are looking for a **direct `.zip` URL**. That is the supported path — do not
try to crawl Google Drive folders and hand-pick individual files; this skill
downloads a whole press-kit zip.

### 2. Download the ZIP to the ignored .cache/ dir

```bash
mkdir -p .cache
curl -fL --retry 2 -A "Mozilla/5.0" -o .cache/presskit_<game>_<version_id>.zip "<zip_url>"
# verify it is a real zip, not an HTML error page
python3 -c "import zipfile,sys; sys.exit(0 if zipfile.is_zipfile('.cache/presskit_<game>_<version_id>.zip') else 1)" \
  && echo OK || echo "NOT A ZIP — wrong link"
```

`.cache/` is gitignored, so the download never pollutes `git status`.

If the download is not a valid zip (e.g. you got an HTML page or a redirect to a
Drive viewer), go back to step 1 and find a genuine direct `.zip` link from
another source.

### 3. Return the result

Print, for [[poe-theme-updater]] to consume verbatim:

```
PRESSKIT_ZIP=.cache/presskit_<game>_<version_id>.zip
GAME=<poe1|poe2>
```

## Notes

- **No filtering of inner files here.** Hand the whole zip downstream; the
  updater extracts it and the AI picks logo/background by looking at the images.
- If you genuinely cannot find an official `.zip` (some seasons only ship a Drive
  folder), stop and report that to the user with the links you found, rather than
  guessing — let them supply a zip or a local path.
