#!/usr/bin/env python3
"""Cut a vanilla resource pack down to what the block mesher reads — every block, nothing else.

    python3 scripts/nucleation-pack.py [--from ~/RustroverProjects/Nucleation/render_work/pack.zip]
                                       [--out docs/assets/nucleation/build-pack.zip]

Keeps all blockstates, block models, block / entity / particle textures and colormaps, so any
block id works in a live-edited build; drops GUI, item, language, sound and shader assets.
Fails when the result exceeds the size budget.
"""
from __future__ import annotations

import os
import sys
import zipfile
from pathlib import Path

KEEP_PREFIXES = (
    "assets/minecraft/blockstates/",
    "assets/minecraft/models/block/",
    "assets/minecraft/textures/block/",
    "assets/minecraft/textures/entity/",
    "assets/minecraft/textures/particle/",
    "assets/minecraft/textures/colormap/",
)
KEEP_FILES = ("pack.mcmeta", "pack.png")
BUDGET = 4 * 1024 * 1024


def option(name: str, fallback: str) -> str:
    args = sys.argv[1:]
    return args[args.index(f"--{name}") + 1] if f"--{name}" in args else fallback


def main() -> int:
    source = Path(
        os.path.expanduser(
            option(
                "from",
                os.environ.get(
                    "NUCLEATION_PACK", "~/RustroverProjects/Nucleation/render_work/pack.zip"
                ),
            )
        )
    )
    out = Path(option("out", "docs/assets/nucleation/build-pack.zip"))
    if not source.exists():
        print(f"error: no resource pack at {source}", file=sys.stderr)
        return 1
    count = 0
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as dst:
        for info in sorted(src.infolist(), key=lambda item: item.filename):
            name = info.filename
            if info.is_dir():
                continue
            if name in KEEP_FILES or name.startswith(KEEP_PREFIXES):
                dst.writestr(name, src.read(name))
                count += 1
    size = out.stat().st_size
    print(f"wrote {out} ({size / 1024:.1f} KB, {count} entries)")
    if size > BUDGET:
        print(f"error: {out} exceeds the {BUDGET // 1024} KB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
