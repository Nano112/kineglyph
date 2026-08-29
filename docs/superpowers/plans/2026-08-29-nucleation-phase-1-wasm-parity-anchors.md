# Nucleation Phase 1 — WASM parity + anchors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the `BuildAnimation` engine behaves identically in native Rust, WASM/JS, and Python for the beacon and crafting-nook builds, and add named **anchors** that every frame reports in world space.

**Architecture:** The native engine is the source of truth: a Rust test records the beacon and nook builds, samples frames at pinned times, and writes JSON fixtures. A Node test (against the packaged WASM) and a Python test rebuild the same animations and compare against the fixtures. Anchors are a new builder concept (`name`, `group`, group-local point) carried in `Frame.anchors` after transformation by the group's pose matrix; they cross the Diplomat bridge as JSON like frames do.

**Tech Stack:** Rust (edition per `Cargo.toml`), serde_json, Diplomat bridge (`tools/gen-bindings.sh`), WASM package via `tools/package-npm.sh`, Node ≥ 18 (`node:test`, `node:assert`), Python via `.venv`.

**Spec:** `docs/superpowers/specs/2026-08-29-nucleation-integration-design.md` (Kineglyph repo) — sections "Nucleation additions" 1 and 3, "Testing".

## Global Constraints

- All work happens in `~/RustroverProjects/Nucleation` on a new branch `build-animation-anchors` from `master`. The working tree already has the author's uncommitted edits (`Cargo.toml`, `README.md`, `.github/workflows/dev-tiers.yml`, `apps/door-cert-wasm/*`): **never `git add -A`; stage only the paths each task names.**
- Nucleation stays agnostic: no reference to Kineglyph anywhere in code, bindings, or docs.
- `bindings/` is generated and committed: after any `src/bridge` change run `tools/gen-bindings.sh`, then commit the regenerated `bindings/js`, `bindings/c`, `bindings/cpp`, `bindings/kotlin/src`, `bindings/python/src`, `bindings/php` together with the bridge change.
- Fixture numbers are never typed by hand: they come from `NUCLEATION_WRITE_FIXTURES=1 cargo test --test build_animation_parity`.
- Float comparisons in JS/Python use an absolute tolerance of `1e-4` (WASM is f32 like native, but JSON round-trips through f64).
- Use the repo's existing formatting: `cargo fmt`, Prettier-free JS in the style of `examples/readme/animation/engine.mjs`.

---

### Task 1: Native fixture writer for the beacon and nook builds

**Files:**
- Create: `tests/build_animation_parity.rs`
- Create: `tests/fixtures/build-animation/beacon.json` (generated)
- Create: `tests/fixtures/build-animation/crafting-nook.json` (generated)

**Interfaces:**
- Produces: fixture JSON shape used by Tasks 2 and 5:
  ```json
  {
    "name": "beacon",
    "groupCount": 10,
    "durationMs": 2400.0,
    "sampleTimesMs": [0.0, 450.0, 1000.0, 1500.0, 2400.0],
    "frames": [ { "time_ms": 0.0, "poses": [[0, {…Pose…}], …], "camera": {…}, "gizmos": [], "anchors": [] }, … ]
  }
  ```
  `frames[i]` is exactly `serde_json::to_value(animation.frame_at(sampleTimesMs[i]))`.
- Produces: `fn beacon() -> BuildAnimation` and `fn crafting_nook() -> BuildAnimation` (private to the test, but their bodies are copied verbatim into Tasks 2 and 5 in JS/Python).

- [ ] **Step 1: Create the branch**

```bash
cd ~/RustroverProjects/Nucleation
git checkout -b build-animation-anchors
```

- [ ] **Step 2: Write the test with fixture writing and comparison**

```rust
// tests/build_animation_parity.rs
//! The native engine is the source of truth for the WASM/JS and Python parity
//! suites. Run with `NUCLEATION_WRITE_FIXTURES=1` to (re)generate the fixtures
//! under tests/fixtures/build-animation; without it the test asserts that the
//! engine still produces exactly the committed fixtures.
use nucleation::animation::{AnimationEffect, BuildAnimation};
use serde_json::{json, Value};
use std::path::PathBuf;

const SAMPLE_TIMES_MS: [f32; 5] = [0.0, 450.0, 1000.0, 1500.0, 2400.0];

fn beacon() -> BuildAnimation {
    let mut animation = BuildAnimation::new("beacon");
    animation.set_step_ms(140.0);
    for x in -1..=1 {
        for z in -1..=1 {
            animation.set_block(x, 0, z, "minecraft:gold_block").unwrap();
        }
    }
    animation
        .with_effect(AnimationEffect::from_clip(nucleation::animation::presets::spin_in(680.0, 1.0)))
        .set_block(0, 1, 0, "minecraft:beacon")
        .unwrap();
    let mut camera = AnimationEffect::new(2_400.0);
    camera = camera.tween(
        nucleation::animation::Property::RotY,
        -4.0,
        4.0,
        nucleation::animation::Easing::InOutSine,
    );
    animation.animate_camera(camera.clip().clone(), 0.0);
    animation
}

fn crafting_nook() -> BuildAnimation {
    let mut animation = BuildAnimation::new("crafting_nook");
    animation.set_step_ms(520.0);
    animation.begin_group(None).unwrap();
    for x in 0..5 {
        for z in 0..5 {
            animation.set_block(x, 0, z, "minecraft:spruce_planks").unwrap();
        }
    }
    animation.end_group().unwrap();
    animation.begin_group(None).unwrap();
    for y in 1..=3 {
        for x in 0..5 {
            let block = if x == 2 && y == 2 {
                "minecraft:light_blue_stained_glass"
            } else if x == 0 || x == 4 {
                "minecraft:stripped_spruce_log[axis=y]"
            } else {
                "minecraft:oak_planks"
            };
            animation.set_block(x, y, 0, block).unwrap();
        }
        for z in 1..5 {
            let block = if z == 2 && y == 2 {
                "minecraft:light_blue_stained_glass"
            } else if z == 4 {
                "minecraft:stripped_spruce_log[axis=y]"
            } else {
                "minecraft:oak_planks"
            };
            animation.set_block(0, y, z, block).unwrap();
        }
    }
    animation.end_group().unwrap();
    animation
        .with_effect(AnimationEffect::from_clip(nucleation::animation::presets::spin_in(620.0, 1.0)))
        .set_block(1, 1, 1, "minecraft:crafting_table")
        .unwrap();
    animation.set_block(3, 1, 1, "minecraft:chest[facing=south]").unwrap();
    animation.begin_group(None).unwrap();
    animation.set_block(4, 2, 1, "minecraft:wall_torch[facing=south]").unwrap();
    animation.set_block(1, 2, 4, "minecraft:wall_torch[facing=east]").unwrap();
    animation.end_group().unwrap();
    let mut camera = AnimationEffect::new(3_000.0);
    camera = camera.tween(
        nucleation::animation::Property::RotY,
        -5.0,
        6.0,
        nucleation::animation::Easing::InOutSine,
    );
    animation.animate_camera(camera.clip().clone(), 0.0);
    animation
}

fn fixture(name: &str, animation: &BuildAnimation) -> Value {
    let frames: Vec<Value> = SAMPLE_TIMES_MS
        .iter()
        .map(|t| serde_json::to_value(animation.frame_at(*t)).unwrap())
        .collect();
    json!({
        "name": name,
        "groupCount": animation.groups().len(),
        "durationMs": animation.duration_ms(),
        "sampleTimesMs": SAMPLE_TIMES_MS,
        "frames": frames,
    })
}

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/build-animation")
        .join(format!("{name}.json"))
}

fn check(name: &str, animation: BuildAnimation) {
    let value = fixture(name, &animation);
    let path = fixture_path(name);
    if std::env::var_os("NUCLEATION_WRITE_FIXTURES").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, serde_json::to_string_pretty(&value).unwrap()).unwrap();
        return;
    }
    let committed: Value = serde_json::from_str(
        &std::fs::read_to_string(&path)
            .unwrap_or_else(|_| panic!("missing fixture {}; run with NUCLEATION_WRITE_FIXTURES=1", path.display())),
    )
    .unwrap();
    assert_eq!(value, committed, "{name}: engine output drifted from the committed fixture");
}

#[test]
fn beacon_matches_fixture() {
    let animation = beacon();
    assert_eq!(animation.groups().len(), 10);
    check("beacon", animation);
}

#[test]
fn crafting_nook_matches_fixture() {
    let animation = crafting_nook();
    assert_eq!(animation.groups().len(), 5);
    check("crafting-nook", animation);
}

#[test]
fn sampling_is_pure() {
    let animation = beacon();
    let a = serde_json::to_string(&animation.frame_at(450.0)).unwrap();
    let _later = animation.frame_at(2_000.0);
    let b = serde_json::to_string(&animation.frame_at(450.0)).unwrap();
    assert_eq!(a, b, "sampling later times must not change earlier frames");
}
```

If `AnimationEffect::tween` / `Property::RotY` / `Easing::InOutSine` names differ, read `src/animation/builder.rs:31` and `src/animation/track.rs` / `src/animation/easing.rs` and use the real identifiers; the bridge maps `"rotateY"` → `RotY` in `src/bridge/animation.rs:20` and `"inOutSine"` through `easing()` in the same file.

- [ ] **Step 3: Run without fixtures to see it fail for the right reason**

Run: `cargo test --quiet --test build_animation_parity 2>&1 | tail -5`
Expected: FAIL with `missing fixture …/beacon.json; run with NUCLEATION_WRITE_FIXTURES=1` (and `sampling_is_pure` PASS).

- [ ] **Step 4: Generate the fixtures, then run the comparison**

Run:
```bash
NUCLEATION_WRITE_FIXTURES=1 cargo test --quiet --test build_animation_parity
cargo test --quiet --test build_animation_parity
node -e 'const f=require("./tests/fixtures/build-animation/beacon.json");console.log(f.groupCount,f.durationMs,f.frames.length,f.frames[1].poses.length)'
```
Expected: both runs PASS; the node line prints `10 2400 5 10`.

- [ ] **Step 5: Commit**

```bash
git add tests/build_animation_parity.rs tests/fixtures/build-animation/
git commit -m "test: pin beacon and crafting-nook build animations as fixtures"
```

---

### Task 2: Node/WASM parity test and verify script

**Files:**
- Create: `tests/node_build_animation_test.mjs`
- Create: `tools/verify-build-animation.sh`

**Interfaces:**
- Consumes: fixtures from Task 1; `dist/npm/index.mjs` exports `AnimationEffect`, `BuildAnimation` (JS names: `create`, `setStepMs`, `setBlock`, `withEffect`, `beginGroup`, `endGroup`, `animateCamera`, `frameJson`, `groupCount`, `durationMs`; `AnimationEffect.spinIn`, `AnimationEffect.create(ms).addTween(name, from, to, easing)`).
- Produces: `buildBeacon(nucleation)` and `buildCraftingNook(nucleation)` helpers in the test file (Task 4 extends them with anchors).

- [ ] **Step 1: Write the failing test**

```js
// tests/node_build_animation_test.mjs
// Parity of the WASM build-animation engine with the native fixtures.
// Run via tools/verify-build-animation.sh (needs dist/npm and a
// node_modules/nucleation symlink to it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AnimationEffect, BuildAnimation } from "nucleation";

const EPSILON = 1e-4;
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/build-animation/${name}.json`, import.meta.url)));

export function buildBeacon() {
  const animation = BuildAnimation.create("beacon");
  animation.setStepMs(140);
  for (let x = -1; x <= 1; x += 1) {
    for (let z = -1; z <= 1; z += 1) animation.setBlock(x, 0, z, "minecraft:gold_block");
  }
  animation.withEffect(AnimationEffect.spinIn(680, 1)).setBlock(0, 1, 0, "minecraft:beacon");
  const camera = AnimationEffect.create(2_400);
  camera.addTween("rotateY", -4, 4, "inOutSine");
  animation.animateCamera(camera, 0);
  return animation;
}

export function buildCraftingNook() {
  const animation = BuildAnimation.create("crafting_nook");
  animation.setStepMs(520);
  animation.beginGroup();
  for (let x = 0; x < 5; x += 1) {
    for (let z = 0; z < 5; z += 1) animation.setBlock(x, 0, z, "minecraft:spruce_planks");
  }
  animation.endGroup();
  animation.beginGroup();
  for (const y of [1, 2, 3]) {
    for (let x = 0; x < 5; x += 1) {
      const block =
        x === 2 && y === 2
          ? "minecraft:light_blue_stained_glass"
          : x === 0 || x === 4
            ? "minecraft:stripped_spruce_log[axis=y]"
            : "minecraft:oak_planks";
      animation.setBlock(x, y, 0, block);
    }
    for (let z = 1; z < 5; z += 1) {
      const block =
        z === 2 && y === 2
          ? "minecraft:light_blue_stained_glass"
          : z === 4
            ? "minecraft:stripped_spruce_log[axis=y]"
            : "minecraft:oak_planks";
      animation.setBlock(0, y, z, block);
    }
  }
  animation.endGroup();
  animation.withEffect(AnimationEffect.spinIn(620, 1)).setBlock(1, 1, 1, "minecraft:crafting_table");
  animation.setBlock(3, 1, 1, "minecraft:chest[facing=south]");
  animation.beginGroup();
  animation.setBlock(4, 2, 1, "minecraft:wall_torch[facing=south]");
  animation.setBlock(1, 2, 4, "minecraft:wall_torch[facing=east]");
  animation.endGroup();
  const camera = AnimationEffect.create(3_000);
  camera.addTween("rotateY", -5, 6, "inOutSine");
  animation.animateCamera(camera, 0);
  return animation;
}

function assertClose(actual, expected, path) {
  if (typeof expected === "number") {
    assert.ok(typeof actual === "number", `${path}: expected a number, got ${typeof actual}`);
    assert.ok(Math.abs(actual - expected) <= EPSILON, `${path}: ${actual} ≠ ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected an array`);
    assert.equal(actual.length, expected.length, `${path}: length`);
    expected.forEach((item, i) => assertClose(actual[i], item, `${path}[${i}]`));
  } else if (expected !== null && typeof expected === "object") {
    assert.ok(actual !== null && typeof actual === "object", `${path}: expected an object`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: keys`);
    for (const key of Object.keys(expected)) assertClose(actual[key], expected[key], `${path}.${key}`);
  } else {
    assert.equal(actual, expected, path);
  }
}

for (const [name, build] of [["beacon", buildBeacon], ["crafting-nook", buildCraftingNook]]) {
  test(`${name}: WASM engine matches the native fixture`, () => {
    const expected = fixture(name);
    const animation = build();
    assert.equal(animation.groupCount(), expected.groupCount);
    assertClose(animation.durationMs(), expected.durationMs, "durationMs");
    expected.sampleTimesMs.forEach((t, i) => {
      const frame = JSON.parse(animation.frameJson(t));
      assertClose(frame, expected.frames[i], `frames[${i}] @${t}ms`);
    });
  });

  test(`${name}: sampling is pure and order-independent`, () => {
    const animation = build();
    const first = animation.frameJson(450);
    animation.frameJson(2_000);
    animation.frameJson(0);
    assert.equal(animation.frameJson(450), first);
  });
}
```

- [ ] **Step 2: Write the verify script**

```bash
#!/usr/bin/env bash
# tools/verify-build-animation.sh — native fixtures vs WASM/JS (and Python, Task 5).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"
WORK_DIR="$(mktemp -d /tmp/nucleation-build-animation.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$WORK_DIR/javascript/node_modules" "$WORK_DIR/javascript/fixtures"

cargo test --quiet --test build_animation_parity >"$WORK_DIR/rust.log" 2>&1 || { cat "$WORK_DIR/rust.log"; exit 1; }

if ! ./tools/package-npm.sh dist/npm >"$WORK_DIR/package.log" 2>&1; then
  cat "$WORK_DIR/package.log"
  exit 1
fi
cp "$REPO_ROOT/tests/node_build_animation_test.mjs" "$WORK_DIR/javascript/"
cp -R "$REPO_ROOT/tests/fixtures/build-animation" "$WORK_DIR/javascript/fixtures/"
ln -s "$REPO_ROOT/dist/npm" "$WORK_DIR/javascript/node_modules/nucleation"
( cd "$WORK_DIR/javascript" && node --test node_build_animation_test.mjs ) >"$WORK_DIR/javascript.log" 2>&1 \
  || { cat "$WORK_DIR/javascript.log"; exit 1; }

echo "Build-animation parity passed: Rust fixtures, WASM/JS"
```

Then: `chmod +x tools/verify-build-animation.sh`.

- [ ] **Step 3: Run the script; expect the WASM build then a pass**

Run: `./tools/verify-build-animation.sh`
Expected: prints `Build-animation parity passed: Rust fixtures, WASM/JS`. The first `package-npm.sh` run builds the WASM (minutes); later runs are stamped and skip. If a frame differs, the assertion names the path (e.g. `frames[2] @1000ms.poses[3][1].opacity: 0.5 ≠ 1`) — that is a real engine divergence: investigate in `src/animation`, fix natively, regenerate fixtures (`NUCLEATION_WRITE_FIXTURES=1`), and note the cause in the commit message.

- [ ] **Step 4: Commit**

```bash
git add tests/node_build_animation_test.mjs tools/verify-build-animation.sh
git commit -m "test: verify the WASM build-animation engine against native fixtures"
```

---

### Task 3: Anchors in the engine

**Files:**
- Modify: `src/animation/builder.rs` (struct at ~line 103, `new` at ~119, `end_group` at ~307, `frame_at` at ~2042)
- Modify: `src/animation/timeline.rs` (`Frame` at ~line 95)
- Modify: `src/animation/mod.rs` (re-exports at ~line 37-46)
- Test: `src/animation/builder.rs` (unit tests module at the end of the file) and `tests/build_animation_parity.rs`

**Interfaces:**
- Produces:
  ```rust
  // src/animation/timeline.rs
  #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
  pub struct Anchor { pub name: String, pub group: GroupId, pub local: [f32; 3] }
  #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
  pub struct AnchorSample { pub name: String, pub group: GroupId, pub world: [f32; 3], pub opacity: f32 }
  pub struct Frame { …, #[serde(default)] pub anchors: Vec<AnchorSample> }
  // src/animation/builder.rs
  impl BuildAnimation {
      pub fn add_anchor(&mut self, name: &str, x: f32, y: f32, z: f32) -> Result<GroupId, String>;
      pub fn add_anchor_to_group(&mut self, group: GroupId, name: &str, x: f32, y: f32, z: f32) -> Result<(), String>;
      pub fn anchors(&self) -> &[Anchor];
  }
  ```
  `add_anchor` attaches to the open group if one is open, else to the most recently recorded group; errors when nothing has been recorded yet or the name is empty/duplicate. `local` is in world block coordinates at record time (the same space poses use); `world` in a frame is `transform_point(pose.matrix, local)`; `opacity` copies the group's pose opacity so a consumer can fade with the block.

- [ ] **Step 1: Write the failing unit tests**

Append to the existing `#[cfg(test)] mod tests` in `src/animation/builder.rs` (create it at the end of the file if there is none):

```rust
#[test]
fn anchors_follow_their_group_pose() {
    let mut animation = BuildAnimation::new("anchors");
    animation.set_step_ms(100.0);
    animation.set_block(0, 0, 0, "minecraft:stone").unwrap();
    let group = animation.add_anchor("stone-top", 0.5, 1.0, 0.5).unwrap();
    assert_eq!(group, 0);
    assert_eq!(animation.anchors().len(), 1);

    let frame = animation.frame_at(animation.duration_ms() + 1.0);
    let sample = &frame.anchors[0];
    assert_eq!(sample.name, "stone-top");
    assert_eq!(sample.group, 0);
    for (a, b) in sample.world.iter().zip([0.5, 1.0, 0.5]) {
        assert!((a - b).abs() < 1e-5, "settled anchor stays put: {:?}", sample.world);
    }
    assert!((sample.opacity - 1.0).abs() < 1e-6);

    let early = animation.frame_at(0.0);
    assert_eq!(early.anchors.len(), 1, "anchors are reported before the block lands");
    assert!(early.anchors[0].opacity < 1.0 || early.anchors[0].world != sample.world);
}

#[test]
fn add_anchor_targets_the_open_group_and_rejects_duplicates() {
    let mut animation = BuildAnimation::new("anchors");
    assert!(animation.add_anchor("nothing", 0.0, 0.0, 0.0).is_err());
    animation.begin_group(None).unwrap();
    animation.set_block(0, 0, 0, "minecraft:stone").unwrap();
    animation.set_block(1, 0, 0, "minecraft:stone").unwrap();
    animation.add_anchor("floor", 1.0, 1.0, 0.5).unwrap();
    let id = animation.end_group().unwrap();
    assert_eq!(animation.anchors()[0].group, id);
    assert!(animation.add_anchor("floor", 0.0, 0.0, 0.0).is_err(), "duplicate name");
    assert!(animation.add_anchor_to_group(99, "x", 0.0, 0.0, 0.0).is_err(), "unknown group");
    assert!(animation.add_anchor("", 0.0, 0.0, 0.0).is_err(), "empty name");
}
```

- [ ] **Step 2: Run to verify they fail to compile**

Run: `cargo test --quiet --lib animation::builder::tests 2>&1 | grep -E "error|anchors" | head -5`
Expected: compile errors `no method named add_anchor`.

- [ ] **Step 3: Implement**

In `src/animation/timeline.rs`, next to `GizmoLine`:

```rust
/// A named point recorded on one animation group, in the same block
/// coordinates poses use. Renderers and documentation tools decide what to
/// draw at it; the engine only transforms it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Anchor {
    pub name: String,
    pub group: GroupId,
    pub local: [f32; 3],
}

/// An anchor at one instant: its group's pose applied to the local point.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnchorSample {
    pub name: String,
    pub group: GroupId,
    pub world: [f32; 3],
    pub opacity: f32,
}
```

Add to `Frame`:

```rust
    #[serde(default)]
    pub anchors: Vec<AnchorSample>,
```

and `anchors: Vec::new()` wherever `Frame { … }` is constructed (the `seek` at ~line 216 — search `gizmos: Vec::new()`).

In `src/animation/mod.rs` extend the timeline re-export: `pub use timeline::{Anchor, AnchorSample, CameraPose, Frame, GizmoKind, GizmoLine, Target, Timeline};`.

In `src/animation/builder.rs`:

```rust
// struct BuildAnimation: add
    anchors: Vec<super::Anchor>,
    /// Anchors added while a group is open; attached to that group in end_group.
    open_group_anchors: Vec<(String, [f32; 3])>,
// new(): add
            anchors: Vec::new(),
            open_group_anchors: Vec::new(),
```

In `end_group`, right after `let id = self.steps.len() as GroupId;`:

```rust
        for (name, local) in self.open_group_anchors.drain(..) {
            self.anchors.push(super::Anchor { name, group: id, local });
        }
```

New methods (place after `set_operation_gizmos`):

```rust
    fn validate_anchor_name(&self, name: &str) -> Result<(), String> {
        if name.trim().is_empty() {
            return Err("anchor names cannot be empty".into());
        }
        if self.anchors.iter().any(|anchor| anchor.name == name)
            || self.open_group_anchors.iter().any(|(pending, _)| pending == name)
        {
            return Err(format!("anchor \"{name}\" already exists"));
        }
        Ok(())
    }

    /// Record a named point on the open group, or on the most recent group when
    /// none is open. Returns the group the anchor belongs to (for an open group,
    /// the id it will receive from `end_group`).
    pub fn add_anchor(&mut self, name: &str, x: f32, y: f32, z: f32) -> Result<GroupId, String> {
        self.validate_anchor_name(name)?;
        if self.open_group.is_some() {
            self.open_group_anchors.push((name.to_string(), [x, y, z]));
            return Ok(self.steps.len() as GroupId);
        }
        let group = self
            .steps
            .len()
            .checked_sub(1)
            .ok_or_else(|| "add_anchor needs a recorded group; place a block first".to_string())?
            as GroupId;
        self.anchors.push(super::Anchor { name: name.to_string(), group, local: [x, y, z] });
        Ok(group)
    }

    /// Record a named point on an already recorded group.
    pub fn add_anchor_to_group(
        &mut self,
        group: GroupId,
        name: &str,
        x: f32,
        y: f32,
        z: f32,
    ) -> Result<(), String> {
        self.validate_anchor_name(name)?;
        if (group as usize) >= self.steps.len() {
            return Err(format!("unknown animation group {group}"));
        }
        self.anchors.push(super::Anchor { name: name.to_string(), group, local: [x, y, z] });
        Ok(())
    }

    pub fn anchors(&self) -> &[super::Anchor] {
        &self.anchors
    }
```

In `frame_at`, before the `if self.operation_gizmos {` block:

```rust
        frame.anchors = self
            .anchors
            .iter()
            .map(|anchor| {
                let pose = frame.pose(anchor.group);
                let matrix = pose
                    .and_then(|pose| pose.matrix)
                    .unwrap_or_else(super::operation::identity);
                super::AnchorSample {
                    name: anchor.name.clone(),
                    group: anchor.group,
                    world: super::pose::transform_point(matrix, anchor.local),
                    opacity: pose.map_or(0.0, |pose| pose.opacity),
                }
            })
            .collect();
```

`transform_point` lives at `src/animation/pose.rs:206`; if it is private, make it `pub`. Confirm `Pose.matrix` is `Option<Mat4>` (`src/animation/pose.rs:36`).

- [ ] **Step 4: Run the unit tests and the fixture test**

Run: `cargo test --quiet --lib animation::builder::tests && cargo test --quiet --test build_animation_parity 2>&1 | tail -3`
Expected: builder tests PASS. The parity test FAILS because frames now carry `"anchors": []` — regenerate: `NUCLEATION_WRITE_FIXTURES=1 cargo test --quiet --test build_animation_parity`, then `cargo test --quiet --test build_animation_parity` PASSES. `git diff --stat tests/fixtures` shows only the added `"anchors": []` keys.

- [ ] **Step 5: Commit**

```bash
cargo fmt
git add src/animation/builder.rs src/animation/timeline.rs src/animation/mod.rs tests/fixtures/build-animation/
git commit -m "feat(animation): named anchors carried through every frame"
```

---

### Task 4: Anchors across the bridge, regenerated bindings, JS parity with anchors

**Files:**
- Modify: `src/bridge/animation.rs` (inside `impl BuildAnimation`, after `set_operation_gizmos` at ~line 513)
- Regenerate: `bindings/**` via `tools/gen-bindings.sh`
- Modify: `tests/build_animation_parity.rs` (add anchors to both builds)
- Modify: `tests/node_build_animation_test.mjs` (same anchors + an anchors test)

**Interfaces:**
- Produces (JS): `animation.addAnchor(name: string, x, y, z): number`, `animation.addAnchorToGroup(group: number, name, x, y, z): void`, `animation.anchorsJson(): string` → `[{ name, group, local: [x,y,z] }]`; `frameJson(t)` now includes `anchors: [{ name, group, world, opacity }]`.
- Produces (Python, same names in snake_case): `add_anchor`, `add_anchor_to_group`, `anchors_json`.
- Fixture builds gain anchors: beacon → `add_anchor("beacon", 0.5, 2.0, 0.5)` after the beacon block; nook → `add_anchor("crafting-table", 1.5, 2.0, 1.5)` after the crafting table and, inside the torch group, `add_anchor("torches", 4.5, 2.5, 1.5)`.

- [ ] **Step 1: Bridge methods**

```rust
        /// Record a named point on the open group, or the most recent group.
        /// Returns the group id the anchor belongs to.
        pub fn add_anchor(
            &mut self,
            name: &DiplomatStr,
            x: f32,
            y: f32,
            z: f32,
        ) -> Result<u32, NucleationError> {
            let name = utf8(name)?;
            self.0
                .add_anchor(name, x, y, z)
                .map_err(|_| NucleationError::InvalidArgument)
        }

        pub fn add_anchor_to_group(
            &mut self,
            group: u32,
            name: &DiplomatStr,
            x: f32,
            y: f32,
            z: f32,
        ) -> Result<(), NucleationError> {
            let name = utf8(name)?;
            self.0
                .add_anchor_to_group(group, name, x, y, z)
                .map_err(|_| NucleationError::InvalidArgument)
        }

        pub fn anchors_json(&self, out: &mut DiplomatWrite) -> Result<(), NucleationError> {
            let json = serde_json::to_string(self.0.anchors()).map_err(|_| NucleationError::Serialize)?;
            write!(out, "{}", json).map_err(|_| NucleationError::Serialize)
        }
```

`utf8` is already imported at the top of the bridge module (`use super::{easing, exclusions_json, property, utf8};`).

- [ ] **Step 2: Regenerate bindings and check the JS surface**

Run:
```bash
cargo check --quiet
./tools/gen-bindings.sh
grep -n "addAnchor\|anchorsJson" bindings/js/BuildAnimation.d.ts
git status --short bindings | wc -l
```
Expected: `cargo check` clean; the grep shows `addAnchor(name: string, x: number, y: number, z: number): number;`, `addAnchorToGroup(...)`, `anchorsJson(): string;`; the status count is small (only BuildAnimation-related files in each binding target changed). If `gen-bindings.sh` rejects the installed `diplomat-tool`, follow the message it prints (it names the exact `cargo install` command).

- [ ] **Step 3: Add anchors to the fixture builds (Rust)**

In `tests/build_animation_parity.rs`, `beacon()`: after the beacon `set_block`, add `animation.add_anchor("beacon", 0.5, 2.0, 0.5).unwrap();`. In `crafting_nook()`: after the crafting-table `set_block`, add `animation.add_anchor("crafting-table", 1.5, 2.0, 1.5).unwrap();` and inside the torch group (after the two torch `set_block`s, before `end_group`) add `animation.add_anchor("torches", 4.5, 2.5, 1.5).unwrap();`. Add to `fixture()`'s JSON: `"anchors": serde_json::to_value(animation.anchors()).unwrap(),`. Add to `beacon_matches_fixture`: `assert_eq!(animation.anchors().len(), 1);` and to `crafting_nook_matches_fixture`: `assert_eq!(animation.anchors().len(), 2);`.

Run: `NUCLEATION_WRITE_FIXTURES=1 cargo test --quiet --test build_animation_parity && cargo test --quiet --test build_animation_parity && node -e 'const f=require("./tests/fixtures/build-animation/crafting-nook.json");console.log(f.anchors, f.frames[4].anchors)'`
Expected: PASS; the node line prints two anchor declarations and two samples whose `world` equals `local` at the final time with `opacity` 1.

- [ ] **Step 4: Mirror in the JS test**

In `buildBeacon()` after the beacon `setBlock`: `animation.addAnchor("beacon", 0.5, 2.0, 0.5);`. In `buildCraftingNook()`: after the crafting-table line `animation.addAnchor("crafting-table", 1.5, 2.0, 1.5);`, and inside the torch group after the second torch `animation.addAnchor("torches", 4.5, 2.5, 1.5);`. Add a test:

```js
for (const [name, build] of [["beacon", buildBeacon], ["crafting-nook", buildCraftingNook]]) {
  test(`${name}: anchors match the native declarations and samples`, () => {
    const expected = fixture(name);
    const animation = build();
    assertClose(JSON.parse(animation.anchorsJson()), expected.anchors, "anchors");
    const last = JSON.parse(animation.frameJson(expected.durationMs));
    assertClose(last.anchors, expected.frames.at(-1).anchors, "final anchors");
    assert.throws(() => animation.addAnchor(expected.anchors[0].name, 0, 0, 0), /./, "duplicate name rejected");
  });
}
```

Run: `./tools/verify-build-animation.sh`
Expected: `package-npm.sh` rebuilds (bridge changed), then `Build-animation parity passed: Rust fixtures, WASM/JS`.

- [ ] **Step 5: Commit**

```bash
cargo fmt
git add src/bridge/animation.rs bindings/ tests/build_animation_parity.rs tests/fixtures/build-animation/ tests/node_build_animation_test.mjs
git commit -m "feat(bridge): expose build-animation anchors to every binding"
```

---

### Task 5: Python parity

**Files:**
- Create: `tests/python_build_animation_test.py`
- Modify: `tools/verify-build-animation.sh`

**Interfaces:**
- Consumes: fixtures (Task 4 shape), Python API `BuildAnimation.create`, `set_step_ms`, `set_block`, `with_effect`, `begin_group`/`end_group`, `animate_camera`, `frame_json`, `group_count`, `duration_ms`, `add_anchor`, `anchors_json`; `AnimationEffect.spin_in`, `AnimationEffect.create(ms).add_tween(name, from, to, easing)`.

- [ ] **Step 1: Write the test**

```python
"""Parity of the Python build-animation engine with the native fixtures."""
import json
import math
import sys
from pathlib import Path

from nucleation import AnimationEffect, BuildAnimation

EPSILON = 1e-4
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "build-animation"


def build_beacon():
    animation = BuildAnimation.create("beacon")
    animation.set_step_ms(140)
    for x in range(-1, 2):
        for z in range(-1, 2):
            animation.set_block(x, 0, z, "minecraft:gold_block")
    animation.with_effect(AnimationEffect.spin_in(680, 1)).set_block(0, 1, 0, "minecraft:beacon")
    animation.add_anchor("beacon", 0.5, 2.0, 0.5)
    camera = AnimationEffect.create(2_400)
    camera.add_tween("rotateY", -4, 4, "inOutSine")
    animation.animate_camera(camera, 0)
    return animation


def build_crafting_nook():
    animation = BuildAnimation.create("crafting_nook")
    animation.set_step_ms(520)
    animation.begin_group()
    for x in range(5):
        for z in range(5):
            animation.set_block(x, 0, z, "minecraft:spruce_planks")
    animation.end_group()
    animation.begin_group()
    for y in (1, 2, 3):
        for x in range(5):
            if x == 2 and y == 2:
                block = "minecraft:light_blue_stained_glass"
            elif x in (0, 4):
                block = "minecraft:stripped_spruce_log[axis=y]"
            else:
                block = "minecraft:oak_planks"
            animation.set_block(x, y, 0, block)
        for z in range(1, 5):
            if z == 2 and y == 2:
                block = "minecraft:light_blue_stained_glass"
            elif z == 4:
                block = "minecraft:stripped_spruce_log[axis=y]"
            else:
                block = "minecraft:oak_planks"
            animation.set_block(0, y, z, block)
    animation.end_group()
    animation.with_effect(AnimationEffect.spin_in(620, 1)).set_block(1, 1, 1, "minecraft:crafting_table")
    animation.add_anchor("crafting-table", 1.5, 2.0, 1.5)
    animation.set_block(3, 1, 1, "minecraft:chest[facing=south]")
    animation.begin_group()
    animation.set_block(4, 2, 1, "minecraft:wall_torch[facing=south]")
    animation.set_block(1, 2, 4, "minecraft:wall_torch[facing=east]")
    animation.add_anchor("torches", 4.5, 2.5, 1.5)
    animation.end_group()
    camera = AnimationEffect.create(3_000)
    camera.add_tween("rotateY", -5, 6, "inOutSine")
    animation.animate_camera(camera, 0)
    return animation


def assert_close(actual, expected, path):
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"
    elif isinstance(expected, (int, float)):
        assert isinstance(actual, (int, float)), f"{path}: not a number: {actual!r}"
        assert math.isclose(actual, expected, abs_tol=EPSILON), f"{path}: {actual} != {expected}"
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), f"{path}: length"
        for i, item in enumerate(expected):
            assert_close(actual[i], item, f"{path}[{i}]")
    else:
        assert isinstance(actual, dict), f"{path}: not an object"
        assert sorted(actual) == sorted(expected), f"{path}: keys {sorted(actual)} != {sorted(expected)}"
        for key, item in expected.items():
            assert_close(actual[key], item, f"{path}.{key}")


def check(name, build):
    expected = json.loads((FIXTURES / f"{name}.json").read_text())
    animation = build()
    assert animation.group_count() == expected["groupCount"], name
    assert_close(animation.duration_ms(), expected["durationMs"], f"{name}.durationMs")
    assert_close(json.loads(animation.anchors_json()), expected["anchors"], f"{name}.anchors")
    for i, t in enumerate(expected["sampleTimesMs"]):
        assert_close(json.loads(animation.frame_json(t)), expected["frames"][i], f"{name}.frames[{i}]@{t}")
    first = animation.frame_json(450)
    animation.frame_json(2_000)
    assert animation.frame_json(450) == first, f"{name}: sampling is not pure"


check("beacon", build_beacon)
check("crafting-nook", build_crafting_nook)
print("Build-animation Python parity: OK")
```

- [ ] **Step 2: Rebuild the Python package and run**

Run:
```bash
.venv/bin/pip install ./bindings/python >/tmp/nucleation-py-build.log 2>&1 || tail -20 /tmp/nucleation-py-build.log
.venv/bin/python tests/python_build_animation_test.py
```
Expected: `Build-animation Python parity: OK`. (The pip build compiles the full crate; it takes several minutes. If `group_count`/`duration_ms` names differ in the generated Python API, check `bindings/python/build/*/nucleation.pyi` and use the names it lists.)

- [ ] **Step 3: Add Python to the verify script**

Insert before the final `echo` in `tools/verify-build-animation.sh`:

```bash
"$REPO_ROOT/.venv/bin/python" "$REPO_ROOT/tests/python_build_animation_test.py" >"$WORK_DIR/python.log" 2>&1 \
  || { cat "$WORK_DIR/python.log"; exit 1; }
grep -q "Build-animation Python parity: OK" "$WORK_DIR/python.log"
```

and change the final line to `echo "Build-animation parity passed: Rust fixtures, WASM/JS, Python"`.

Run: `./tools/verify-build-animation.sh`
Expected: `Build-animation parity passed: Rust fixtures, WASM/JS, Python`.

- [ ] **Step 4: Commit**

```bash
git add tests/python_build_animation_test.py tools/verify-build-animation.sh
git commit -m "test: Python build-animation parity against the native fixtures"
```

---

### Task 6: Documentation and release notes

**Files:**
- Modify: `docs/features/animation.md` (after "## The camera is on the same clock", before "## Determinism")
- Modify: `examples/readme/animation/engine.mjs` and `examples/readme/animation/engine.py` (new snippet markers)
- Modify: `RELEASE_NOTES.md` (top)

- [ ] **Step 1: Add the snippet to both examples**

In `examples/readme/animation/engine.mjs`, after the `[end:record]` marker's block (the animation is fully recorded), add:

```js
// --8<-- [start:anchors]
// A named point on the diamond block's group. Frames report it in world
// space after the group's pose, so a renderer or a docs tool can draw
// a hotspot, a leader line, or a label that lands with the block.
animation.addAnchorToGroup(1, "diamond", 4.5, 2.0, 0.5);
const settled = JSON.parse(animation.frameJson(animation.durationMs()));
console.log(settled.anchors[0].world); // [4.5, 2, 0.5]
// --8<-- [end:anchors]
```

In `engine.py` the same with `animation.add_anchor_to_group(1, "diamond", 4.5, 2.0, 0.5)` and `json.loads(animation.frame_json(animation.duration_ms()))["anchors"][0]["world"]`. Group `1` is the diamond block (group 0 is the bricks row). Keep each file's final "… example: OK" print intact so `verify-animation-docs.sh` still passes.

- [ ] **Step 2: Document the contract**

Add to `docs/features/animation.md`:

````markdown
## Anchors

An anchor is a named point on one animation group. Record it on the open group
or the most recent one with `addAnchor(name, x, y, z)`, or on any group with
`addAnchorToGroup(group, name, x, y, z)`. Coordinates are the block coordinates
poses use, so `[4.5, 2.0, 0.5]` is the top-centre of the block at `(4, 1, 0)`.

Every frame carries `anchors: [{ name, group, world, opacity }]`: the point
after its group's pose at that instant, plus the group's opacity. The engine
only transforms anchors; what to draw at one — a hotspot, a label, a leader
line that lands with the block — is the renderer's decision.

=== "Python"

    ```python
    --8<-- "examples/readme/animation/engine.py:anchors"
    ```

=== "JavaScript"

    ```javascript
    --8<-- "examples/readme/animation/engine.mjs:anchors"
    ```

`anchorsJson()` lists the declarations (`name`, `group`, `local`). Names are
unique per animation.
````

- [ ] **Step 3: Release note**

At the top of `RELEASE_NOTES.md`, above `# Nucleation v0.10.14`:

```markdown
# Unreleased

**Build-animation anchors and cross-binding parity.** `BuildAnimation` records
named anchors (`add_anchor`, `add_anchor_to_group`, `anchors_json`) that every
frame reports in world space after the group's pose, for hotspots and labels
that land with their block. The beacon and crafting-nook builds are pinned as
native fixtures and verified against the WASM/JS and Python engines by
`tools/verify-build-animation.sh`.
```

- [ ] **Step 4: Verify the docs scripts**

Run: `./tools/verify-animation-docs.sh && ./tools/verify-build-animation.sh`
Expected: both print their success lines.

- [ ] **Step 5: Commit**

```bash
git add docs/features/animation.md examples/readme/animation/engine.mjs examples/readme/animation/engine.py RELEASE_NOTES.md
git commit -m "docs: build-animation anchors"
```

---

## Self-review notes

- Spec coverage: parity suite (Tasks 1, 2, 5), anchors in engine/bridge/bindings (3, 4), docs (6). GLB export, `toAnimatedGlbB64`, and the Kineglyph package are Phase 2 and get their own plan.
- The engine may reveal a genuine WASM/native divergence in Task 2; the plan treats that as a native fix + fixture regeneration, never as a tolerance bump.
- Type names used across tasks: `Anchor`, `AnchorSample`, `Frame.anchors`, `add_anchor`, `add_anchor_to_group`, `anchors`, JS `addAnchor`/`addAnchorToGroup`/`anchorsJson`, Python snake_case equivalents — consistent throughout.
