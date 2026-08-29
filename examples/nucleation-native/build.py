"""Build the beacon with Nucleation's native engine: frames + animated GLB, no browser.

Usage (from the Nucleation checkout's virtualenv, or any Python with `nucleation` installed):

    NUCLEATION_PACK=/path/to/pack.zip python build.py out/ [fps]

Writes `out/frames/beacon-0000.png …` (transparent background, one frame per 1/fps s plus a
hold) and `out/beacon.glb`. `sheet.mjs` composes the Kineglyph sheet on top of these.
"""

import base64
import os
import sys
from pathlib import Path

from nucleation import AnimationEffect, BuildAnimation, RenderConfig, ResourcePack

# The same build script the docs run in WASM (docs/nucleation-builds.md, "Beacon").
FPS = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
HOLD_MS = 900.0
# Pixel size of the frames: the sheet's view rectangle (VIEW in sheet.mjs), 1:1.
WIDTH, HEIGHT = 1368, 1168


def build() -> BuildAnimation:
    animation = BuildAnimation.create("beacon")
    animation.set_step_ms(140)
    for x in (-1, 0, 1):
        for z in (-1, 0, 1):
            animation.set_block(x, 0, z, "minecraft:gold_block")
    animation.with_effect(AnimationEffect.spin_in(680, 1)).set_block(0, 1, 0, "minecraft:beacon")
    animation.add_anchor("beacon", 0.0, 1.5, 0.0)
    animation.add_anchor_to_group(0, "first-gold", -1.0, 0.5, -1.0)
    orbit = AnimationEffect.create(2_400)
    orbit.add_tween("rotateY", -4.0, 4.0, "inOutSine")
    animation.animate_camera(orbit, 0)
    return animation


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
    pack_path = os.environ.get("NUCLEATION_PACK")
    if not pack_path:
        sys.exit("set NUCLEATION_PACK to a resource pack zip")
    pack_bytes = list(Path(pack_path).read_bytes())
    animation = build()

    # Camera: the sheet's `camera: { yaw: 28, pitch: 24, zoom: 0.8 }` over the isometric base.
    config = RenderConfig.create(WIDTH, HEIGHT)
    config.set_isometric()
    config.set_yaw(28.0)
    config.set_pitch(24.0)
    config.set_zoom(0.8)
    config.set_sphere_fit(True)
    config.set_background(0.0, 0.0, 0.0, 0.0)
    config.clear_grid()

    frames = out / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    count = animation.render_frames(pack_bytes, config, str(frames / "beacon-"), FPS, HOLD_MS)
    pack = ResourcePack.from_bytes(pack_bytes)
    (out / "beacon.glb").write_bytes(base64.b64decode(animation.to_animated_glb_b64(pack, int(FPS))))
    print(f"{count} frames at {FPS:g} fps → {frames}; GLB → {out / 'beacon.glb'}")


if __name__ == "__main__":
    main()
