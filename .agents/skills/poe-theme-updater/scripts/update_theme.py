#!/usr/bin/env python3
# .agents/skills/poe-theme-updater/scripts/update_theme.py
"""
Apply a PoE/PoE2 season theme from human-chosen press-kit assets.

Two stages, no PR — the maintainer (@NERDHEAD-lab) is the only reviewer, so the
change lands on gh-pages as a single commit after they approve.

  STAGE 1 (default): given explicit --logo / --background paths (the AI picks
    these by *looking* at the extracted press kit), validate the logo, copy both
    into assets/themes/<game>/<id>/, upsert themes.json, and write a review doc
    to the ignored .cache/ dir. Git is NOT touched — only the working tree gets
    the asset + themes.json changes, so `git status` stays meaningful.

  STAGE 2 (--approve): the maintainer said OK. Commit assets/themes.json onto
    gh-pages as one commit and push. The 'Update Theme List Hashes' workflow then
    fills assetsHashes on its own — this script never writes them.

If stage 1 is re-run after a rejection, it just overwrites the working-tree files
again; nothing is committed yet, so there is no force-push to manage.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

REVIEW_DIR = ".cache"
REVIEW_DOC = ".cache/review.md"


def parse_args():
    p = argparse.ArgumentParser(description="Apply a launcher season theme from chosen assets.")
    p.add_argument("--game", choices=["poe1", "poe2"], required=True)
    p.add_argument("--version-id", required=True, help="e.g. 0.5.0 or 3.28")
    p.add_argument("--season-name", required=True, help="e.g. Return of the Ancients")
    p.add_argument("--start-date", required=True,
                   help="UTC start, 'YYYY-MM-DD HH:mm:ss' (matches themes.schema.json)")
    p.add_argument("--logo", help="Path to the chosen logo image (transparent PNG expected)")
    p.add_argument("--background", help="Path to the chosen background/key-art image")
    p.add_argument("--force-logo", action="store_true",
                   help="Skip the logo transparency rejection (use when you've eyeballed it "
                        "against existing themes and it's fine).")
    p.add_argument("--themes-json", default="./themes.json")
    p.add_argument("--repo-root", default=".", help="Repo root; assets under <root>/assets/themes")
    p.add_argument("--approve", action="store_true",
                   help="STAGE 2: commit the already-applied theme onto gh-pages and push.")
    args = p.parse_args()
    if not args.approve and (not args.logo or not args.background):
        p.error("--logo and --background are required in stage 1 (omit only with --approve)")
    return args


# ----------------------------------------------------------------------------- logo check

def logo_transparency_status(path):
    """Return (ok, detail). ok=True means looks transparent; ok=None means we
    couldn't check (Pillow missing); ok=False means it looks opaque."""
    try:
        from PIL import Image
    except ImportError:
        return None, "Pillow 미설치 — 투명도 검사를 건너뜁니다 (pip install Pillow 권장)."

    try:
        img = Image.open(path)
    except Exception as e:
        return False, f"이미지를 열 수 없습니다: {e}"

    if img.mode not in ("RGBA", "LA", "PA") and "transparency" not in img.info:
        return False, f"알파 채널이 없습니다 (mode={img.mode}). 배경 위에 합성된 로고일 가능성."

    # Check the corners: a clean logo mark is transparent at its edges.
    rgba = img.convert("RGBA")
    w, h = rgba.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    alphas = [rgba.getpixel(c)[3] for c in corners]
    transparent_corners = sum(1 for a in alphas if a < 16)
    if transparent_corners >= 3:
        return True, f"알파 채널 있음, 모서리 {transparent_corners}/4 투명 — 깨끗한 로고로 보입니다."
    return False, (f"알파 채널은 있으나 모서리 {transparent_corners}/4 만 투명 — "
                   "배경이 채워진 이미지일 수 있습니다.")


# ----------------------------------------------------------------------------- stage 1

def copy_assets(logo_src, bg_src, repo_root, game, version_id):
    rel_dir = f"assets/themes/{game}/{version_id}"
    dest_dir = os.path.join(repo_root, rel_dir)
    os.makedirs(dest_dir, exist_ok=True)

    bg_ext = os.path.splitext(bg_src)[1].lower()
    logo_rel = f"{rel_dir}/logo.png"
    bg_rel = f"{rel_dir}/bg{bg_ext}"

    shutil.copy(logo_src, os.path.join(repo_root, logo_rel))
    shutil.copy(bg_src, os.path.join(repo_root, bg_rel))
    print(f"[+] logo -> {logo_rel}")
    print(f"[+] bg   -> {bg_rel}")
    return logo_rel, bg_rel


def upsert_theme(themes_json, game, version_id, season_name, start_date, bg_rel, logo_rel):
    with open(themes_json, encoding="utf-8") as f:
        config = json.load(f)
    if game not in config:
        sys.exit(f"[!] themes.json has no '{game}' array")

    entry = {
        "id": version_id,
        "name": season_name,
        "assets": {"background": bg_rel, "logo": logo_rel},
        "startDate": start_date,
    }
    arr = config[game]
    idx = next((i for i, t in enumerate(arr) if t.get("id") == version_id), -1)
    if idx >= 0:
        arr[idx] = {**arr[idx], **entry}  # keep any existing hashes/endDate
        print(f"[+] Updated existing {game} theme id={version_id}")
    else:
        arr.append(entry)
        print(f"[+] Appended new {game} theme id={version_id}")

    with open(themes_json, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
        f.write("\n")


def write_review_doc(repo_root, game, version_id, season_name, start_date,
                     bg_rel, logo_rel, logo_note):
    game_name = "PoE 1" if game == "poe1" else "PoE 2"
    # absolute file paths so the images render when the doc is opened locally
    bg_abs = os.path.abspath(os.path.join(repo_root, bg_rel))
    logo_abs = os.path.abspath(os.path.join(repo_root, logo_rel))
    os.makedirs(os.path.join(repo_root, REVIEW_DIR), exist_ok=True)
    doc_path = os.path.join(repo_root, REVIEW_DOC)

    body = f"""# 테마 리뷰: {season_name} ({version_id})

> 이 문서는 `.cache/` (gitignore) 에 있습니다. 커밋되지 않습니다.
> 아래 에셋과 정보를 확인하고, 문제 없으면 `--approve` 로 gh-pages 에 반영하세요.

## 테마 정보
| 항목 | 값 |
| --- | --- |
| Game | {game_name} |
| ID | `{version_id}` |
| Name | {season_name} |
| Start (UTC) | `{start_date}` |
| Background | `{bg_rel}` |
| Logo | `{logo_rel}` |

## 로고 투명도 검사
{logo_note}

## 미리보기
**Background**

![background]({bg_abs})

**Logo** (체커보드/어두운 배경에서 투명 여부 확인)

![logo]({logo_abs})

## 승인 시 실행
```bash
python3 .agents/skills/poe-theme-updater/scripts/update_theme.py \\
  --game {game} --version-id {version_id} \\
  --season-name "{season_name}" --start-date "{start_date}" --approve
```
"""
    with open(doc_path, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"[+] Review doc -> {doc_path}")
    return doc_path


def run_stage1(args):
    for label, path in (("logo", args.logo), ("background", args.background)):
        if not os.path.isfile(path):
            sys.exit(f"[!] --{label} not found: {path}")

    ok, detail = logo_transparency_status(args.logo)
    if ok is True:
        logo_note = f"✅ {detail}"
    elif ok is None:
        logo_note = f"⚠️ {detail}"
    else:  # ok is False
        if not args.force_logo:
            sys.exit(f"[!] 로고 투명도 검사 실패: {detail}\n"
                     f"    다른 로고를 고르거나, 기존 테마와 비교해 문제없다고 판단되면 "
                     f"--force-logo 로 강제 진행하세요.")
        logo_note = f"⚠️ {detail} (--force-logo 로 강제 진행됨)"
    print(f"[*] logo transparency: {logo_note}")

    logo_rel, bg_rel = copy_assets(args.logo, args.background, args.repo_root,
                                   args.game, args.version_id)
    upsert_theme(args.themes_json, args.game, args.version_id, args.season_name,
                 args.start_date, bg_rel, logo_rel)
    write_review_doc(args.repo_root, args.game, args.version_id, args.season_name,
                     args.start_date, bg_rel, logo_rel, logo_note)
    print("\n[DONE] Stage 1 complete. Open .cache/review.md, then re-run with --approve.")
    print("[i] Git was NOT touched — assets/themes.json are staged in the working tree only.")


# ----------------------------------------------------------------------------- stage 2

def git(repo_root, *a, check=True):
    r = subprocess.run(["git", "-C", repo_root, *a], capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"[!] git {' '.join(a)} failed:\n{r.stderr.strip()}")
    return r.stdout.strip()


def run_approve(args):
    root = args.repo_root
    asset_dir = f"assets/themes/{args.game}/{args.version_id}"

    # Land on gh-pages, carrying the working-tree changes with us.
    if git(root, "rev-parse", "--abbrev-ref", "HEAD") != "gh-pages":
        git(root, "checkout", "gh-pages")

    git(root, "add", asset_dir, "themes.json")
    if not git(root, "status", "--porcelain"):
        sys.exit("[!] Nothing staged — run stage 1 first (assets/themes.json unchanged).")

    msg = f"feat(themes): add season theme {args.version_id} - {args.season_name}"
    git(root, "commit", "-m", msg)
    print(f"[+] Committed on gh-pages: {msg}")
    git(root, "push", "origin", "gh-pages")
    print("[+] Pushed to origin/gh-pages — 'Update Theme List Hashes' workflow will fill hashes.")
    print("\n[DONE] Theme applied to gh-pages.")


def main():
    args = parse_args()
    if args.approve:
        run_approve(args)
    else:
        run_stage1(args)


if __name__ == "__main__":
    main()
