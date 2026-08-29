#!/usr/bin/env python3
"""Trim a vanilla resource pack down to the blocks the docs build animations use.

    python3 scripts/nucleation-pack.py [--from ~/RustroverProjects/Nucleation/render_work/pack.zip]
                                       [--out docs/assets/nucleation/build-pack.zip]

Walks blockstates → models → parents → textures for the block list below and writes a zip that
stays small enough to commit. Fails when the result exceeds the size budget.
"""
from __future__ import annotations

import json
import os
import re
import sys
import zipfile
from pathlib import Path

BLOCKS = [
    "gold_block",
    "beacon",
    "spruce_planks",
    "oak_planks",
    "stripped_spruce_log",
    "light_blue_stained_glass",
    "crafting_table",
    "chest",
    "wall_torch",
    "torch",
]
# Entity-rendered blocks reference textures outside the model graph.
# The mesher marks torches, campfires, and candles with flame and smoke particle quads.
EXTRA_TEXTURES = [
    "entity/chest/normal",
    "entity/beacon_beam",
    "particle/flame",
    "particle/soul_fire_flame",
    *[f"particle/big_smoke_{i}" for i in range(7)],
    *[f"particle/generic_{i}" for i in range(8)],
]
BUDGET = 200 * 1024


def option(name: str, fallback: str) -> str:
    args = sys.argv[1:]
    return args[args.index(f"--{name}") + 1] if f"--{name}" in args else fallback


def strip_ns(ref: str) -> str:
    return ref.split(":", 1)[1] if ":" in ref else ref


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
    with zipfile.ZipFile(source) as pack:
        names = set(pack.namelist())

        def read_json(path: str) -> dict:
            return json.loads(pack.read(path))

        keep: set[str] = set()
        models: list[str] = []
        for block in BLOCKS:
            state = f"assets/minecraft/blockstates/{block}.json"
            if state not in names:
                print(f"warning: no blockstate for {block}", file=sys.stderr)
                continue
            keep.add(state)
            text = pack.read(state).decode()
            for ref in re.findall(r'"model"\s*:\s*"([^"]+)"', text):
                models.append(strip_ns(ref))
        seen: set[str] = set()
        textures: set[str] = set()
        while models:
            model = models.pop()
            if model in seen:
                continue
            seen.add(model)
            path = f"assets/minecraft/models/{model}.json"
            if path not in names:
                print(f"warning: missing model {path}", file=sys.stderr)
                continue
            keep.add(path)
            doc = read_json(path)
            parent = doc.get("parent")
            if isinstance(parent, str):
                models.append(strip_ns(parent))
            for value in doc.get("textures", {}).values():
                if isinstance(value, str) and not value.startswith("#"):
                    textures.add(strip_ns(value))
        for texture in list(textures) + EXTRA_TEXTURES:
            for suffix in (".png", ".png.mcmeta"):
                path = f"assets/minecraft/textures/{texture}{suffix}"
                if path in names:
                    keep.add(path)
        if "pack.mcmeta" in names:
            keep.add("pack.mcmeta")

        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as trimmed:
            for path in sorted(keep):
                trimmed.writestr(path, pack.read(path))
    size = out.stat().st_size
    print(f"wrote {out} ({size / 1024:.1f} KB, {len(keep)} entries)")
    if size > BUDGET:
        print(f"error: {out} exceeds the {BUDGET // 1024} KB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
