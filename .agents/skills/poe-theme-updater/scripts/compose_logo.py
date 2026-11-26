#!/usr/bin/env python3
"""Compose two official transparent marks into a temporary season lock-up.

This helper is intentionally small and deterministic. It never edits either
source file and never adds a background: the league mark keeps its source
proportions and is positioned over the lower edge of the game mark on a
transparent canvas. The output is scratch/provisional input for update_theme.py,
not proof that GGG published a combined logo.
"""

import argparse
import os
import sys


def parse_args():
    p = argparse.ArgumentParser(description="Compose official transparent PoE marks.")
    p.add_argument("--game-logo", required=True, help="Official transparent game logo PNG")
    p.add_argument("--league-logo", required=True, help="Official transparent league logo PNG")
    p.add_argument("--output", required=True, help="Output PNG path")
    p.add_argument("--game-width", type=int, default=3600,
                   help="Trimmed game-mark width in pixels (default: 3600)")
    p.add_argument("--league-width", type=int, default=2900,
                   help="Trimmed league-mark width in pixels (default: 2900)")
    p.add_argument("--overlap", type=int, default=600,
                   help="Vertical placement overlap; source proportions stay unchanged (default: 600)")
    return p.parse_args()


def load_trimmed(path, Image):
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{path}: no visible pixels")
    return image.crop(bbox)


def resize_width(image, width, Image):
    if width <= 0:
        raise ValueError("width must be positive")
    height = max(1, round(image.height * width / image.width))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def main():
    args = parse_args()
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow is required: install it before composing a logo.")

    try:
        game = resize_width(load_trimmed(args.game_logo, Image), args.game_width, Image)
        league = resize_width(load_trimmed(args.league_logo, Image), args.league_width, Image)
    except (OSError, ValueError) as exc:
        sys.exit(f"Cannot prepare logo source: {exc}")

    if args.overlap < 0 or args.overlap >= min(game.height, league.height):
        sys.exit("--overlap must be non-negative and smaller than both mark heights")

    canvas = Image.new("RGBA", (max(game.width, league.width),
                                 game.height + league.height - args.overlap), (0, 0, 0, 0))
    game_x = (canvas.width - game.width) // 2
    league_x = (canvas.width - league.width) // 2
    canvas.alpha_composite(game, (game_x, 0))
    # Keep the source proportions; tune only the vertical placement so the
    # league panel attaches to the lower game ornament like existing lock-ups.
    canvas.alpha_composite(league, (league_x, game.height - args.overlap))

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    canvas.save(args.output, format="PNG", optimize=True)
    print(f"[+] temporary transparent logo -> {args.output}")
    print(f"    game={game.width}x{game.height}, league={league.width}x{league.height}, "
          f"overlap={args.overlap}, canvas={canvas.width}x{canvas.height}")
    print(f"    sources: {args.game_logo} + {args.league_logo}")


if __name__ == "__main__":
    main()
