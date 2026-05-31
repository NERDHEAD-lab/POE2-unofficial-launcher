---
name: poe-searcher
description: Finds and downloads the official press kit for a Path of Exile (poe1) or Path of Exile 2 (poe2) league/season. Given a season name and/or version, it web-searches for the official press-kit .zip direct link and downloads it to .cache/, or — when the season only ships a Google Drive folder — downloads the logo/background candidates from that folder. Trigger when you need the media assets (logo + background) for a PoE/PoE2 season and only have its name or version. Outputs PRESSKIT_ZIP (or PRESSKIT_DIR) and GAME for poe-theme-updater to consume.
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

You are looking for a **direct `.zip` URL** — that is the preferred path. If you
find one, use step 2. If the season only ships a **Google Drive folder** (GGG
does this often — the GamesPress release links a `drive.google.com/drive/folders/...`
instead of a zip), do **not** stop: use the Drive-folder fallback in **step 2b**.

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
Drive viewer), go back to step 1 and find a genuine direct `.zip` link, or use
step 2b if the only source is a Drive folder.

### 2b. Fallback: download from a Google Drive folder

Use this **only when there is no direct `.zip`** and the official source is a
public Drive folder. No extra tooling needed — `gdown`/`rclone`/a Drive MCP are
usually absent. Python `requests` is enough, and outbound to `drive.google.com`
works (the `curl` _binary_ may be sandbox-blocked — use `requests`, not curl).

You do **not** need every file — grab only the logo + background candidates so
the download stays small. List the folder, then fetch the candidates:

```bash
mkdir -p .cache/presskit
python3 - "$FOLDER_ID" <<'PY'
import sys, re, requests
fid = sys.argv[1]
s = requests.Session(); s.headers.update({"User-Agent": "Mozilla/5.0"})
# 1) List EVERY file (the /drive/folders/ view only lazy-renders ~45 DOM rows;
#    embeddedfolderview returns the full list as simple HTML).
html = s.get(f"https://drive.google.com/embeddedfolderview?id={fid}#list", timeout=30).text
files = re.findall(r'id="entry-([0-9A-Za-z_-]+)".*?flip-entry-title">([^<]+)<', html, re.S)
# 2) Keep logo AND background candidates. Background names vary a LOT
#    (key-art, BG, background, splash, wallpaper, NNNNxNNNN, free-weekend, ...),
#    so the filter is deliberately wide — better to over-grab than to miss the
#    one usable background. Drop obvious non-assets (cinematics, boss/atlas
#    shots, docs, video, ascendancy art).
KEEP = re.compile(r'logo|wordmark|key.?art|keyart|background|\bbg\b|splash|'
                  r'wallpaper|\d{3,4}x\d{3,4}|free.?weekend|main', re.I)
SKIP = re.compile(r'cinematic|trailer|livestream|infographic|transcript|'
                  r'fact.?sheet|press.?release|ascendancy|boss|gameplay|'
                  r'atlas|rune|breach|delirium|ritual', re.I)
cand = [(i, n) for i, n in files
        if re.search(r'\.(png|jpe?g|webp)$', n, re.I)
        and KEEP.search(n) and not SKIP.search(n)]
def dl(i, n):
    r = s.get(f"https://drive.google.com/uc?export=download&id={i}", timeout=120)
    d = r.content
    if b"<html" in d[:200].lower():  # large-file confirm interstitial
        c = re.search(rb'name="confirm" value="([^"]+)"', d)
        u = re.search(rb'name="uuid" value="([^"]+)"', d)
        if c and u:
            d = s.get("https://drive.usercontent.google.com/download",
                      params={"id": i, "export": "download",
                              "confirm": c.group(1).decode(), "uuid": u.group(1).decode()},
                      timeout=120).content
    open(f".cache/presskit/{n}", "wb").write(d); return len(d)
for i, n in cand:
    print(f"{dl(i,n):>12,}  {n}")
PY
```

This step only **gathers** candidates — it does **not** choose. The filter is
heuristic and the file names lie often (the season's league name may differ from
the press kit's expansion name, e.g. league "Fate of the Vaal" shipping in a
"The Last of the Druids" kit). So if the regex grabbed too few — especially **no
plausible background** — re-list all files and add the missing ones by hand. Err
toward pulling a few extra; downloads land in gitignored `.cache/presskit/`.

[[poe-theme-updater]] makes the final pick (and asks the user when there is more
than one background candidate). To make that pick possible, the candidate set you
hand over should contain, when they exist:

- **the clean logo** — a transparent-background PNG showing the **game name +
  season/league name** lock-up as a free-floating emblem (background scene shows
  _through_ the empty areas, including inside the letters). Reject anything where
  the logo sits on a baked scene (`Logo_Background.png`-style) or is welded into
  the key art (`*_FULL`, `*-with-Logo`) — those fail because their corners/edges
  are opaque.
- **the background candidates** — high-res key art **without** the logo baked in
  (`*No-Logo`, `*KEYART*Background`, `*Transparent`, free-weekend art, 4K `BG`
  files). There are usually several and they are not interchangeable, so pass
  them ALL through; the updater shows them to the user to choose. Skip tiny promo
  banners and the giant logo-bearing composites.

### 3. Return the result

Print, for [[poe-theme-updater]] to consume verbatim — `PRESSKIT_ZIP` for the
zip path (step 2) **or** `PRESSKIT_DIR` for the populated folder (step 2b):

```
# step 2 (direct zip):
PRESSKIT_ZIP=.cache/presskit_<game>_<version_id>.zip
GAME=<poe1|poe2>

# step 2b (Drive fallback — assets already extracted, no zip):
PRESSKIT_DIR=.cache/presskit
GAME=<poe1|poe2>
```

## Notes

- **Direct zip (step 2): no filtering.** Hand the whole zip downstream; the
  updater extracts it and the AI picks logo/background by looking at the images.
- **Drive fallback (step 2b): grab candidates only.** A Drive folder has no zip
  to hand over, so download just the logo/key-art images into `.cache/presskit/`
  and return `PRESSKIT_DIR`. The updater still makes the final logo/bg call.
- Only stop and ask the user if there is **no** official source at all — neither a
  direct `.zip` nor a public Drive folder (e.g. an access-restricted Drive, or
  you can't find any press kit). Then report the links you found and let them
  supply a zip or a local path.
