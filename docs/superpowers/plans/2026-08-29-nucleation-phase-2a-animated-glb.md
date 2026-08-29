# Nucleation Phase 2a — Animated GLB from a BuildAnimation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `BuildAnimation.toAnimatedGlbB64(pack, fps)` — a valid glTF binary with one textured node per animation group, TRS keyframe tracks sampled from the timeline, anchor child nodes, and `extras.nucleation` carrying what core glTF cannot (opacity/tint/emissive tracks, the camera track).

**Architecture:** A new general exporter in Schematic-Mesher (`export/gltf_build.rs`) turns `BuildNode`s (mesh + atlas index + typed tracks + extras + children) into a GLB; it reuses the buffer/accessor helpers of `gltf_animated.rs` and injects node/animation names into the serialized JSON (gltf-json's `names` feature stays off). Nucleation meshes each group from its snapshot, samples `frame_at` at a fixed rate, decomposes each pose matrix into TRS, deduplicates constant runs, and feeds the exporter. The bridge exposes it to JS/Python.

**Tech Stack:** Rust, gltf-json 1.4 (`extras`), serde_json, Diplomat bridge, `tools/package-npm.sh`, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-29-nucleation-integration-design.md` (Kineglyph repo) — "Nucleation additions" item 2.

## Global Constraints

- Two repos: Schematic-Mesher at `~/Documents/code/Schematic-Mesher` (branch `build-glb` from its current HEAD `b88fe96`; the tree has the author's uncommitted `Cargo.lock` and `examples/*` edits — stage only named paths) and Nucleation at `~/RustroverProjects/Nucleation` on the existing branch `build-animation-anchors` (same staging rule; the author's edits to `Cargo.toml`, `README.md`, `.github/**`, `apps/**` stay uncommitted and untouched).
- Nucleation consumes the mesher through a **local `[patch]` during development** (Task 2). The patch is never committed; the final rev bump (Task 6) needs the mesher commit to exist on GitHub, which is the author's call — until then the branch builds only with the local patch, and the report says so.
- Nucleation stays agnostic: no Kineglyph reference in code, bindings, or docs.
- GLB node convention (public contract, documented in Task 5): root node `build:<schematic name>`; group nodes `group:<id>` as its children; anchor nodes `anchor:<name>` as children of their group node; one animation named after the schematic; `extras.nucleation` objects as defined in Task 3.
- Sampling rate default `fps = 30`; keys are deduplicated so constant runs keep only their first and last key.
- Floats in JSON are f32 → f64; tests compare with `1e-4` tolerance.

---

### Task 1: `export_build_glb` in Schematic-Mesher

**Files:**
- Create: `src/export/gltf_build.rs`
- Modify: `src/export/gltf_animated.rs` (make `empty_node`, `cast_bytes`, `align`, `buffer_view`, `accessor`, `push_vec3_channel` `pub(super)`)
- Modify: `src/export/mod.rs:32-38` (module + re-exports)
- Modify: `src/lib.rs` (re-export, next to the existing `export_animated_glb` re-export — search `pub use export::`)

**Interfaces:**
- Produces:
  ```rust
  pub enum Interpolation { Linear, Step }
  pub struct Track<const N: usize> { pub times: Vec<f32>, pub values: Vec<[f32; N]>, pub interpolation: Interpolation }
  pub struct BuildChild { pub name: String, pub translation: [f32; 3], pub extras: Option<serde_json::Value> }
  pub struct BuildNode {
      pub name: String,
      pub mesh: Mesh,                // model-space geometry; empty mesh → empty node
      pub atlas: usize,              // index into BuildScene::atlases
      pub translation: Option<Track<3>>,
      pub rotation: Option<Track<4>>, // unit quaternion [x, y, z, w]
      pub scale: Option<Track<3>>,
      pub extras: Option<serde_json::Value>,
      pub children: Vec<BuildChild>,
  }
  pub struct BuildScene {
      pub name: String,              // root node "build:<name>", animation name
      pub atlases: Vec<TextureAtlas>,
      pub nodes: Vec<BuildNode>,
      pub extras: Option<serde_json::Value>, // root node extras
  }
  pub fn export_build_glb(scene: &BuildScene) -> Result<Vec<u8>>
  ```
  Times are seconds (glTF requires seconds). One image/texture/material per atlas (`MASK` alpha mode, nearest filtering, like `gltf_animated`).

- [ ] **Step 1: Branch and expose the helpers**

```bash
cd ~/Documents/code/Schematic-Mesher
git checkout -b build-glb
```

In `src/export/gltf_animated.rs` change the six helper signatures from `fn` to `pub(super) fn`: `empty_node`, `cast_bytes`, `align`, `buffer_view`, `accessor`, `push_vec3_channel`.

- [ ] **Step 2: Write the failing test**

Append to `src/export/gltf_build.rs` (create the file with just the test module first):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesher::geometry::Vertex;

    fn cube_mesh() -> Mesh {
        let mut mesh = Mesh::new();
        let a = mesh.add_vertex(Vertex::new([0.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0]));
        let b = mesh.add_vertex(Vertex::new([1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 0.0]));
        let c = mesh.add_vertex(Vertex::new([1.0, 0.0, 1.0], [0.0, 1.0, 0.0], [1.0, 1.0]));
        let d = mesh.add_vertex(Vertex::new([0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [0.0, 1.0]));
        mesh.add_quad(a, b, c, d);
        mesh
    }

    /// Split a GLB into its JSON chunk (parsed) and binary chunk length.
    pub(crate) fn glb_json(glb: &[u8]) -> (serde_json::Value, usize) {
        assert_eq!(&glb[0..4], b"glTF");
        let json_len = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
        assert_eq!(&glb[16..20], b"JSON");
        let json: serde_json::Value = serde_json::from_slice(&glb[20..20 + json_len]).unwrap();
        let bin_len = u32::from_le_bytes(glb[20 + json_len..24 + json_len].try_into().unwrap()) as usize;
        (json, bin_len)
    }

    #[test]
    fn exports_named_nodes_tracks_anchors_and_extras() {
        let scene = BuildScene {
            name: "beacon".into(),
            atlases: vec![TextureAtlas::empty()],
            extras: Some(serde_json::json!({ "nucleation": { "version": 1 } })),
            nodes: vec![
                BuildNode {
                    name: "group:0".into(),
                    mesh: cube_mesh(),
                    atlas: 0,
                    translation: Some(Track { times: vec![0.0, 0.5], values: vec![[0.0, 4.0, 0.0], [0.0, 0.0, 0.0]], interpolation: Interpolation::Linear }),
                    rotation: Some(Track { times: vec![0.0, 0.5], values: vec![[0.0, 0.0, 0.0, 1.0], [0.0, 0.7071068, 0.0, 0.7071068]], interpolation: Interpolation::Linear }),
                    scale: Some(Track { times: vec![0.0, 0.5], values: vec![[0.0; 3], [1.0; 3]], interpolation: Interpolation::Step }),
                    extras: Some(serde_json::json!({ "nucleation": { "group": 0 } })),
                    children: vec![BuildChild { name: "anchor:top".into(), translation: [0.5, 1.0, 0.5], extras: None }],
                },
                BuildNode { name: "group:1".into(), mesh: Mesh::new(), atlas: 0, translation: None, rotation: None, scale: None, extras: None, children: vec![] },
            ],
        };
        let glb = export_build_glb(&scene).unwrap();
        let (json, bin_len) = glb_json(&glb);
        assert!(bin_len > 0);
        let nodes = json["nodes"].as_array().unwrap();
        let names: Vec<&str> = nodes.iter().map(|n| n["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["build:beacon", "group:0", "anchor:top", "group:1"]);
        assert_eq!(nodes[0]["extras"]["nucleation"]["version"], 1);
        assert_eq!(nodes[0]["children"], serde_json::json!([1, 3]));
        assert_eq!(nodes[1]["children"], serde_json::json!([2]));
        assert_eq!(nodes[1]["extras"]["nucleation"]["group"], 0);
        assert_eq!(nodes[2]["translation"], serde_json::json!([0.5, 1.0, 0.5]));
        assert!(nodes[1]["mesh"].is_number(), "group:0 carries a mesh");
        assert!(nodes[3]["mesh"].is_null(), "an empty group is an empty node");
        let animation = &json["animations"][0];
        assert_eq!(animation["name"], "beacon");
        assert_eq!(animation["channels"].as_array().unwrap().len(), 3);
        let paths: Vec<&str> = animation["channels"].as_array().unwrap().iter().map(|c| c["target"]["path"].as_str().unwrap()).collect();
        assert_eq!(paths, ["translation", "rotation", "scale"]);
        let interpolations: Vec<&str> = animation["samplers"].as_array().unwrap().iter().map(|s| s["interpolation"].as_str().unwrap()).collect();
        assert_eq!(interpolations, ["LINEAR", "LINEAR", "STEP"]);
        assert_eq!(json["materials"].as_array().unwrap().len(), 1);
        assert_eq!(json["scenes"][0]["nodes"], serde_json::json!([0]));
    }

    #[test]
    fn rejects_a_scene_with_no_geometry() {
        let scene = BuildScene { name: "empty".into(), atlases: vec![], nodes: vec![], extras: None };
        assert!(export_build_glb(&scene).is_err());
    }
}
```

`TextureAtlas::empty()` exists (used by Nucleation); if `Vertex::new` has a different arity, read `src/mesher/geometry.rs:17` and adapt.

- [ ] **Step 3: Run to verify failure**

Run: `cargo test --quiet --lib export::gltf_build 2>&1 | grep -E "^error" | head -3`
Expected: compile errors for the missing types/function.

- [ ] **Step 4: Implement**

Top of `src/export/gltf_build.rs`:

```rust
//! Build GLB export — one node per construction group with TRS keyframe tracks,
//! named child anchors, per-node `extras`, and one material per texture atlas.
//! General enough for any recorder; the pose-colour tracks core glTF cannot
//! express travel in `extras`, where viewers that do not know them ignore them.
use super::gltf_animated::{accessor, align, buffer_view, cast_bytes, empty_node, push_vec3_channel};
use crate::atlas::TextureAtlas;
use crate::error::{MesherError, Result};
use crate::mesher::geometry::Mesh;
use gltf_json as json;
use json::validation::Checked::Valid;
use json::validation::USize64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Interpolation { Linear, Step }

#[derive(Debug, Clone, PartialEq)]
pub struct Track<const N: usize> {
    pub times: Vec<f32>,
    pub values: Vec<[f32; N]>,
    pub interpolation: Interpolation,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BuildChild {
    pub name: String,
    pub translation: [f32; 3],
    pub extras: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct BuildNode {
    pub name: String,
    pub mesh: Mesh,
    pub atlas: usize,
    pub translation: Option<Track<3>>,
    pub rotation: Option<Track<4>>,
    pub scale: Option<Track<3>>,
    pub extras: Option<serde_json::Value>,
    pub children: Vec<BuildChild>,
}

#[derive(Debug, Clone)]
pub struct BuildScene {
    pub name: String,
    pub atlases: Vec<TextureAtlas>,
    pub nodes: Vec<BuildNode>,
    pub extras: Option<serde_json::Value>,
}

impl From<Interpolation> for json::animation::Interpolation {
    fn from(value: Interpolation) -> Self {
        match value {
            Interpolation::Linear => json::animation::Interpolation::Linear,
            Interpolation::Step => json::animation::Interpolation::Step,
        }
    }
}
```

Then `export_build_glb`, structured as:

1. Reject when every node mesh is empty (`MesherError::Export("Cannot export a build with no geometry")`) or any `node.atlas >= scene.atlases.len()`.
2. Encode each atlas with `atlas.to_png()` into the binary buffer (one `json::Image` with `mime_type: Some(json::image::MimeType("image/png".into()))` + `buffer_view`, one `json::Texture`, one `json::Material` with `alpha_mode: Valid(json::material::AlphaMode::Mask)`, `pbr_metallic_roughness.base_color_texture` pointing at it, `double_sided: true`, `metallic_factor 0, roughness_factor 1`) — copy the material block from `gltf_animated.rs` (search `AlphaMode::Mask`) and parameterise the texture index.
3. Node table: index 0 is the root (`empty_node()` with `children` = the group node indices, `extras` from `scene.extras`). Then for each `BuildNode` in order: the group node (mesh from its geometry — reuse the per-piece geometry block of `gltf_animated.rs` lines 125-230 verbatim but with `material: Some(json::Index::new(node.atlas as u32))`; an empty mesh → `empty_node()`), followed immediately by its anchor children as `empty_node()` with `translation: Some(child.translation)`. Record each node's index while emitting so `children` arrays are correct.
4. Channels: for each track present, `push_vec3_channel(...)` for translation/scale with `interpolation.into()`; for rotation, add a sibling `push_vec4_channel` in this file (same body as `push_vec3_channel` but `json::accessor::Type::Vec4`, `cast_bytes::<[f32; 4]>`, `json::animation::Property::Rotation`). Keys are `(time, value)` pairs zipped from `track.times`/`track.values`; return `MesherError::Export` when their lengths differ.
5. `json::Root` as in `gltf_animated.rs` lines 405-450 with the scene root `[0]` and one animation. Then **inject names**: `let mut value = serde_json::to_value(&root)?;` and set `value["nodes"][i]["name"]` for every node (root: `format!("build:{}", scene.name)`, groups/anchors: their `name`), and `value["animations"][0]["name"] = scene.name` when the animation exists. Serialize `value` with `serde_json::to_vec`, pad to 4 bytes with spaces, and assemble the GLB exactly like the tail of `export_animated_glb` (magic, version 2, total length, JSON chunk `0x4E4F534A`, BIN chunk `0x004E4942`).

Extras on nodes: gltf-json's `extras` field is `json::Extras` = `Option<Box<serde_json::value::RawValue>>` under the `extras` feature — build it with `serde_json::value::RawValue::from_string(serde_json::to_string(&value)?)` and wrap in `Some(...)`.

Add to `src/export/mod.rs`: `pub mod gltf_build;` and `pub use gltf_build::{export_build_glb, BuildChild, BuildNode, BuildScene, Interpolation, Track};`. Mirror the re-export in `src/lib.rs` beside `export_animated_glb`.

- [ ] **Step 5: Run the tests**

Run: `cargo test --quiet --lib export:: 2>&1 | grep "test result"; cargo test --quiet 2>&1 | grep "test result" | head -3`
Expected: all PASS (existing export tests unaffected).

- [ ] **Step 6: Commit**

```bash
cargo fmt
git add src/export/gltf_build.rs src/export/gltf_animated.rs src/export/mod.rs src/lib.rs
git commit -m "feat(export): build GLB — named group nodes, TRS tracks, anchors, extras"
git log --oneline -1
```

Note the commit hash: Task 6 needs it.

---

### Task 2: Local mesher patch and TRS decomposition in Nucleation

**Files:**
- Modify (uncommitted): `~/RustroverProjects/Nucleation/Cargo.toml` — append a `[patch]` section
- Modify: `src/animation/pose.rs` (new `decompose_trs`)

**Interfaces:**
- Produces: `pub fn decompose_trs(m: Mat4) -> ([f32; 3], [f32; 4], [f32; 3])` — translation, unit quaternion `[x, y, z, w]`, scale. `Mat4` is column-major (`m[3]` holds translation, as the fixtures show). Negative determinant (a flip) puts the sign on the X scale.

- [ ] **Step 1: Patch the mesher dependency for local development**

Append to `Cargo.toml` (do NOT stage this file):

```toml
[patch."https://github.com/Schem-at/Schematic-Mesher.git"]
schematic-mesher = { path = "/Users/harrison/Documents/code/Schematic-Mesher" }
```

Run: `cargo check --quiet --features meshing 2>&1 | grep -E "^error|patch" | head -5`
Expected: no errors (Cargo prints a note about the patch being used once).

- [ ] **Step 2: Failing tests for the decomposition**

Append to the `tests` module in `src/animation/pose.rs`:

```rust
    #[test]
    fn decompose_recovers_translate_rotate_scale() {
        let pose = Pose {
            translate: [2.0, 3.0, 4.0],
            rotate_deg: [0.0, 90.0, 0.0],
            scale: [2.0, 2.0, 2.0],
            pivot: [0.0; 3],
            ..Pose::default()
        };
        let (t, q, s) = decompose_trs(pose.to_matrix());
        for (a, b) in t.iter().zip([2.0, 3.0, 4.0]) { assert!((a - b).abs() < 1e-4, "{t:?}"); }
        for (a, b) in s.iter().zip([2.0, 2.0, 2.0]) { assert!((a - b).abs() < 1e-4, "{s:?}"); }
        let expected = [0.0, (45f32).to_radians().sin(), 0.0, (45f32).to_radians().cos()];
        let dot: f32 = q.iter().zip(expected).map(|(a, b)| a * b).sum();
        assert!(dot.abs() > 0.9999, "quaternion {q:?} vs {expected:?}");
    }

    #[test]
    fn decompose_keeps_flips_on_the_x_scale() {
        let mut m = identity();
        m[0][0] = -1.0;
        let (_, q, s) = decompose_trs(m);
        assert!((s[0] + 1.0).abs() < 1e-6 && (s[1] - 1.0).abs() < 1e-6);
        assert!((q[3] - 1.0).abs() < 1e-6, "no rotation for a pure mirror: {q:?}");
    }
```

If `Pose` has no `Default`, construct it with `Pose::about([0.0; 3])` and set the fields. `identity()` is `super::operation::identity` — import it in the test module.

- [ ] **Step 3: Implement**

In `src/animation/pose.rs` (public, next to `Mat4`):

```rust
/// Translation, unit quaternion `[x, y, z, w]`, and scale of a column-major
/// affine matrix. A mirrored matrix (negative determinant) keeps the sign on
/// the X scale so glTF viewers reproduce the flip.
pub fn decompose_trs(m: Mat4) -> ([f32; 3], [f32; 4], [f32; 3]) {
    let translation = [m[3][0], m[3][1], m[3][2]];
    let column = |i: usize| [m[i][0], m[i][1], m[i][2]];
    let len = |v: [f32; 3]| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    let (cx, cy, cz) = (column(0), column(1), column(2));
    let det = cx[0] * (cy[1] * cz[2] - cy[2] * cz[1])
        - cx[1] * (cy[0] * cz[2] - cy[2] * cz[0])
        + cx[2] * (cy[0] * cz[1] - cy[1] * cz[0]);
    let mut scale = [len(cx), len(cy), len(cz)];
    if det < 0.0 {
        scale[0] = -scale[0];
    }
    let safe = |s: f32| if s.abs() < 1e-12 { 1.0 } else { s };
    let r = [
        [cx[0] / safe(scale[0]), cx[1] / safe(scale[0]), cx[2] / safe(scale[0])],
        [cy[0] / safe(scale[1]), cy[1] / safe(scale[1]), cy[2] / safe(scale[1])],
        [cz[0] / safe(scale[2]), cz[1] / safe(scale[2]), cz[2] / safe(scale[2])],
    ];
    // r[c][row]: column-major rotation. Standard matrix → quaternion (Shepperd).
    let m00 = r[0][0]; let m11 = r[1][1]; let m22 = r[2][2];
    let (m01, m02, m10, m12, m20, m21) = (r[1][0], r[2][0], r[0][1], r[2][1], r[0][2], r[1][2]);
    let trace = m00 + m11 + m22;
    let q = if trace > 0.0 {
        let s = (trace + 1.0).sqrt() * 2.0;
        [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]
    } else if m00 > m11 && m00 > m22 {
        let s = (1.0 + m00 - m11 - m22).sqrt() * 2.0;
        [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
    } else if m11 > m22 {
        let s = (1.0 + m11 - m00 - m22).sqrt() * 2.0;
        [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
    } else {
        let s = (1.0 + m22 - m00 - m11).sqrt() * 2.0;
        [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]
    };
    let n = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt().max(1e-12);
    (translation, [q[0] / n, q[1] / n, q[2] / n, q[3] / n], scale)
}
```

Here `m[c][row]` indexing follows `Pose::to_matrix` (verify against `src/animation/pose.rs:66-100`: translation is written into `m[3]`). When all three scales are ~0 (a collapsed pop-in start) the rotation is meaningless; the code above yields a finite quaternion because `safe()` avoids division by zero — that is acceptable since the node is invisible at scale 0.

- [ ] **Step 4: Run**

Run: `cargo test --quiet --lib animation::pose 2>&1 | grep "test result"`
Expected: PASS.

- [ ] **Step 5: Commit (pose.rs only)**

```bash
cargo fmt
git add src/animation/pose.rs
git commit -m "feat(animation): decompose pose matrices into translation, rotation, scale"
```

---

### Task 3: `BuildAnimation::to_animated_glb`

**Files:**
- Create: `src/animation/glb.rs`
- Modify: `src/animation/mod.rs` (`#[cfg(feature = "meshing")] pub mod glb;`)
- Modify: `src/animation/builder.rs` — add `mesh_outputs_raw` beside `mesh_outputs` (~line 2196) and make `RecordedStep`'s `mesh_region`/`mesh_source` reachable from `glb.rs` (`pub(super)` on the fields, or a `pub(super) fn steps(&self) -> &[RecordedStep]`)
- Modify: `src/meshing/mod.rs` — `pub(crate) fn mesh_groups_in_region_raw(...) -> Result<Vec<schematic_mesher::MesherOutput>>` (the body of `mesh_groups_in_region` minus the final `mesh_output_from_mesher` conversion; refactor the existing function to call it and convert)
- Test: `tests/build_animation_glb.rs`

**Interfaces:**
- Produces:
  ```rust
  #[cfg(feature = "meshing")]
  impl BuildAnimation {
      pub fn to_animated_glb(&self, pack: &crate::meshing::ResourcePackSource, config: &crate::meshing::MeshConfig, fps: f32) -> crate::meshing::Result<Vec<u8>>;
  }
  ```
- `extras.nucleation` contract:
  - root node: `{ "version": 1, "name": <schematic name>, "durationMs": f32, "fps": f32, "groups": u32, "camera": { "times": [s…], "yaw": [...], "pitch": [...], "zoom": [...], "targetOffset": [[x,y,z]…] } | null }`
  - group node: `{ "group": id, "blocks": count, "poseTrack": { "times": [s…], "opacity": [...], "tint": [[r,g,b,a]…], "emissive": [[r,g,b,a]…] } | null }` — `poseTrack` is present only when any of the three varies over the sampled frames.
  - anchor node: `{ "anchor": name, "group": id }`.

- [ ] **Step 1: Failing integration test**

```rust
// tests/build_animation_glb.rs
#![cfg(feature = "meshing")]
use nucleation::animation::{presets, AnimationEffect, BuildAnimation, Easing, Power, Property};
use nucleation::meshing::{MeshConfig, ResourcePackSource};

fn pack() -> ResourcePackSource {
    let bytes = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/apps/shared-pack/pack.zip")).unwrap();
    ResourcePackSource::from_zip_bytes(&bytes).unwrap()
}

fn beacon() -> BuildAnimation {
    let mut animation = BuildAnimation::new("beacon");
    animation.set_step_ms(140.0);
    for x in -1..=1 {
        for z in -1..=1 {
            animation.set_block(x, 0, z, "minecraft:gold_block").unwrap();
        }
    }
    animation.with_effect(presets::spin_in(680.0, 1.0)).set_block(0, 1, 0, "minecraft:beacon").unwrap();
    animation.add_anchor("beacon", 0.5, 2.0, 0.5).unwrap();
    let camera = AnimationEffect::new(2_400.0).tween(Property::RotY, -4.0, 4.0, Easing::InOut(Power::Sine));
    animation.animate_camera(camera.clip().clone(), 0.0);
    animation
}

fn glb_json(glb: &[u8]) -> serde_json::Value {
    assert_eq!(&glb[0..4], b"glTF");
    let json_len = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
    serde_json::from_slice(&glb[20..20 + json_len]).unwrap()
}

#[test]
fn beacon_exports_groups_tracks_anchor_and_extras() {
    let animation = beacon();
    let glb = animation.to_animated_glb(&pack(), &MeshConfig::default(), 30.0).unwrap();
    let json = glb_json(&glb);
    let nodes = json["nodes"].as_array().unwrap();
    assert_eq!(nodes[0]["name"], "build:beacon");
    assert_eq!(nodes[0]["extras"]["nucleation"]["groups"], 10);
    assert!((nodes[0]["extras"]["nucleation"]["durationMs"].as_f64().unwrap() - 2400.0).abs() < 1e-3);
    assert_eq!(nodes[0]["extras"]["nucleation"]["camera"]["yaw"].as_array().unwrap().len(),
               nodes[0]["extras"]["nucleation"]["camera"]["times"].as_array().unwrap().len());
    let group_names: Vec<&str> = nodes.iter().filter_map(|n| n["name"].as_str()).filter(|n| n.starts_with("group:")).collect();
    assert_eq!(group_names.len(), 10);
    let anchor = nodes.iter().find(|n| n["name"] == "anchor:beacon").expect("anchor node");
    assert_eq!(anchor["translation"], serde_json::json!([0.5, 2.0, 0.5]));
    assert_eq!(anchor["extras"]["nucleation"]["group"], 9);
    let beacon_group = nodes.iter().find(|n| n["name"] == "group:9").unwrap();
    assert!(beacon_group["mesh"].is_number());
    let animation_json = &json["animations"][0];
    assert_eq!(animation_json["name"], "beacon");
    let channels = animation_json["channels"].as_array().unwrap();
    assert!(channels.len() >= 20, "every group gets at least translation + scale: {}", channels.len());
    let materials = json["materials"].as_array().unwrap();
    assert_eq!(materials.len(), 10, "one material per group atlas");
}

#[test]
fn constant_runs_are_deduplicated() {
    let animation = beacon();
    let glb = animation.to_animated_glb(&pack(), &MeshConfig::default(), 30.0).unwrap();
    let json = glb_json(&glb);
    // The first gold block settles at 480 ms; a 2400 ms timeline at 30 fps is 73
    // samples, so a deduplicated scale track for it holds far fewer keys.
    let accessors = json["accessors"].as_array().unwrap();
    let sampler = &json["animations"][0]["samplers"][0];
    let count = accessors[sampler["input"].as_u64().unwrap() as usize]["count"].as_u64().unwrap();
    assert!(count < 40, "expected deduplicated keys, got {count}");
}
```

`ResourcePackSource::from_zip_bytes` — confirm the constructor name in `src/meshing/mod.rs` (search `impl ResourcePackSource`) and adjust. `apps/shared-pack/pack.zip` (566 KB) carries the vanilla blocks these builds use.

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --quiet --features meshing --test build_animation_glb 2>&1 | grep -E "^error" | head -3`
Expected: `no method named to_animated_glb`.

- [ ] **Step 3: Implement**

`src/meshing/mod.rs`: split `mesh_groups_in_region` into `mesh_groups_in_region_raw` (returns `Vec<schematic_mesher::MesherOutput>`, including the empty-group placeholder built with `schematic_mesher::MesherOutput` default/empty — check how an empty `MesherOutput` is constructed in `mesh_groups_in_region`'s empty branch and keep that logic on the raw side) and the existing wrapper mapping through `mesh_output_from_mesher(output, None)`.

`src/animation/builder.rs`, beside `mesh_outputs`:

```rust
    #[cfg(feature = "meshing")]
    pub(super) fn mesh_outputs_raw(
        &self,
        pack: &crate::meshing::ResourcePackSource,
        config: &crate::meshing::MeshConfig,
    ) -> crate::meshing::Result<Vec<schematic_mesher::MesherOutput>> {
        let mut outputs = Vec::with_capacity(self.steps.len());
        for (id, step) in self.steps.iter().enumerate() {
            let group = Group::new(id as GroupId, step.blocks.clone());
            let mut meshed = step.mesh_source.mesh_groups_in_region_raw(
                pack,
                config,
                step.mesh_region.as_deref(),
                &[group],
            )?;
            outputs.push(meshed.remove(0));
        }
        Ok(outputs)
    }

    pub(super) fn group_block_counts(&self) -> Vec<usize> {
        self.steps.iter().map(|step| step.blocks.len()).collect()
    }
```

`src/animation/glb.rs`:

```rust
//! Animated GLB from a build animation: one node per group, TRS tracks sampled
//! from the timeline, anchor child nodes, and `extras.nucleation` for the
//! pose-colour and camera tracks core glTF cannot carry.
use super::pose::decompose_trs;
use super::{BuildAnimation, Frame};
use crate::meshing::{MeshConfig, ResourcePackSource, Result};
use schematic_mesher::{export_build_glb, BuildChild, BuildNode, BuildScene, Interpolation, Track};
use serde_json::json;

const EPSILON: f32 = 1e-5;

fn close<const N: usize>(a: &[f32; N], b: &[f32; N]) -> bool {
    a.iter().zip(b).all(|(x, y)| (x - y).abs() <= EPSILON)
}

/// Keep the first and last key of every constant run, plus every change.
fn dedupe<const N: usize>(times: &[f32], values: Vec<[f32; N]>) -> (Vec<f32>, Vec<[f32; N]>) {
    let mut out_t = Vec::new();
    let mut out_v: Vec<[f32; N]> = Vec::new();
    for (i, value) in values.iter().enumerate() {
        let last = out_v.last();
        let next_same = values.get(i + 1).is_some_and(|n| close(n, value));
        let prev_same = last.is_some_and(|l| close(l, value));
        if prev_same && next_same {
            continue;
        }
        out_t.push(times[i]);
        out_v.push(*value);
    }
    (out_t, out_v)
}

fn track<const N: usize>(times: &[f32], values: Vec<[f32; N]>, rest: [f32; N]) -> Option<Track<N>> {
    if values.iter().all(|v| close(v, &rest)) {
        return None;
    }
    let (times, values) = dedupe(times, values);
    Some(Track { times, values, interpolation: Interpolation::Linear })
}

#[cfg(feature = "meshing")]
impl BuildAnimation {
    pub fn to_animated_glb(&self, pack: &ResourcePackSource, config: &MeshConfig, fps: f32) -> Result<Vec<u8>> {
        let fps = if fps.is_finite() && fps > 0.0 { fps } else { 30.0 };
        let duration = self.duration_ms();
        let count = ((duration / 1000.0) * fps).ceil().max(1.0) as usize + 1;
        let times_ms: Vec<f32> = (0..count).map(|i| ((i as f32) / fps * 1000.0).min(duration)).collect();
        let times_s: Vec<f32> = times_ms.iter().map(|t| t / 1000.0).collect();
        let frames: Vec<Frame> = times_ms.iter().map(|t| self.frame_at(*t)).collect();

        let outputs = self.mesh_outputs_raw(pack, config)?;
        let block_counts = self.group_block_counts();
        let mut atlases = Vec::with_capacity(outputs.len());
        let mut nodes = Vec::with_capacity(outputs.len());
        for (id, output) in outputs.into_iter().enumerate() {
            let mut mesh = output.opaque_mesh;
            mesh.merge(&output.cutout_mesh);
            mesh.merge(&output.transparent_mesh);
            atlases.push(output.atlas);

            let mut translation = Vec::with_capacity(count);
            let mut rotation = Vec::with_capacity(count);
            let mut scale = Vec::with_capacity(count);
            let mut opacity = Vec::with_capacity(count);
            let mut tint = Vec::with_capacity(count);
            let mut emissive = Vec::with_capacity(count);
            for frame in &frames {
                let pose = frame.pose(id as super::GroupId);
                let matrix = pose.and_then(|p| p.matrix).unwrap_or_else(super::operation::identity);
                let (t, q, s) = decompose_trs(matrix);
                translation.push(t);
                rotation.push(q);
                scale.push(s);
                opacity.push([pose.map_or(1.0, |p| p.opacity)]);
                tint.push(pose.map_or([1.0; 4], |p| p.tint));
                emissive.push(pose.map_or([0.0; 4], |p| p.emissive));
            }
            let pose_track = if opacity.iter().all(|o| close(o, &[1.0]))
                && tint.iter().all(|t| close(t, &[1.0; 4]))
                && emissive.iter().all(|e| close(e, &[0.0; 4]))
            {
                serde_json::Value::Null
            } else {
                json!({
                    "times": times_s,
                    "opacity": opacity.iter().map(|o| o[0]).collect::<Vec<_>>(),
                    "tint": tint,
                    "emissive": emissive,
                })
            };
            let children = self
                .anchors()
                .iter()
                .filter(|anchor| anchor.group as usize == id)
                .map(|anchor| BuildChild {
                    name: format!("anchor:{}", anchor.name),
                    translation: anchor.local,
                    extras: Some(json!({ "nucleation": { "anchor": anchor.name, "group": anchor.group } })),
                })
                .collect();
            nodes.push(BuildNode {
                name: format!("group:{id}"),
                mesh,
                atlas: id,
                translation: track(&times_s, translation, [0.0; 3]),
                rotation: track(&times_s, rotation, [0.0, 0.0, 0.0, 1.0]),
                scale: track(&times_s, scale, [1.0; 3]),
                extras: Some(json!({ "nucleation": { "group": id, "blocks": block_counts[id], "poseTrack": pose_track } })),
                children,
            });
        }

        let camera = if frames.iter().any(|f| f.camera.is_some()) {
            let sample = |pick: fn(&super::CameraPose) -> f32| -> Vec<f32> {
                frames.iter().map(|f| f.camera.as_ref().map_or(0.0, pick)).collect()
            };
            json!({
                "times": times_s,
                "yaw": sample(|c| c.yaw),
                "pitch": sample(|c| c.pitch),
                "zoom": frames.iter().map(|f| f.camera.as_ref().map_or(1.0, |c| c.zoom)).collect::<Vec<_>>(),
                "targetOffset": frames.iter().map(|f| f.camera.as_ref().map_or([0.0; 3], |c| c.target_offset)).collect::<Vec<_>>(),
            })
        } else {
            serde_json::Value::Null
        };
        let scene = BuildScene {
            name: self.schematic().metadata.name.clone().unwrap_or_else(|| "build".into()),
            atlases,
            nodes,
            extras: Some(json!({ "nucleation": {
                "version": 1,
                "durationMs": duration,
                "fps": fps,
                "groups": count_groups(self),
                "camera": camera,
            }})),
        };
        export_build_glb(&scene).map_err(|e| crate::meshing::MeshError::Meshing(e.to_string()))
    }
}

fn count_groups(animation: &BuildAnimation) -> usize {
    animation.groups().len()
}
```

Adjust the schematic-name access to whatever `UniversalSchematic` exposes (search `pub fn name` / `metadata.name` in `src/universal_schematic.rs`). Note the scale track uses LINEAR everywhere — a pop-in from scale 0 reads correctly; STEP would only matter for instant effects, which `dedupe` already reduces to two keys 1/fps apart.

Add to `src/animation/mod.rs`: `#[cfg(feature = "meshing")] pub mod glb;`.

- [ ] **Step 4: Run**

Run: `cargo test --quiet --features meshing --test build_animation_glb 2>&1 | grep -E "test result|panicked" | head -5`
Expected: PASS. If `anchor:beacon` extras `group` is not 9, the group numbering differs from the fixture — read `tests/fixtures/build-animation/beacon.json` `anchors[0].group` and fix the test constant, not the code.

- [ ] **Step 5: Coordinate sanity check (no code, one command)**

Run:
```bash
cargo test --quiet --features meshing --test build_animation_glb -- --nocapture 2>&1 | head -2; node -e '
const fs=require("fs");' 2>/dev/null; echo "manual check below"
```
Then add a temporary `eprintln!` in the test printing `accessors[nodes[1]["mesh"] position accessor]["min"]` — or simpler: assert in the test that `group:0`'s position accessor `min` is within `[-1, 0, -1] ± 0.01` (the gold block at (-1,0,-1)). This proves group meshes are in world coordinates (no per-group origin shift). If the min is `[0,0,0]`, the mesher emitted bounds-relative geometry: fix by translating each merged mesh by the group's bounds min (`output.bounds.min`) before pushing the node. Keep the assertion in the test either way.

- [ ] **Step 6: Commit**

```bash
cargo fmt
git add src/animation/glb.rs src/animation/mod.rs src/animation/builder.rs src/meshing/mod.rs tests/build_animation_glb.rs
git commit -m "feat(animation): export a build animation as an animated GLB"
```

---

### Task 4: Bridge, bindings, JS + Python checks

**Files:**
- Modify: `src/bridge/animation.rs` (after `anchors_json`)
- Regenerate: `bindings/**`
- Modify: `tests/node_build_animation_test.mjs`, `tests/python_build_animation_test.py`, `tools/verify-build-animation.sh`

**Interfaces:**
- JS: `animation.toAnimatedGlbB64(pack: ResourcePack, fps: number): string`; Python: `to_animated_glb_b64(pack, fps)`.

- [ ] **Step 1: Bridge**

```rust
        /// The build as an animated GLB (one node per group, TRS tracks sampled
        /// at `fps`, anchor child nodes, `extras.nucleation`), base64-encoded.
        #[cfg(feature = "meshing")]
        pub fn to_animated_glb_b64(
            &self,
            pack: &ResourcePack,
            fps: f32,
            out: &mut DiplomatWrite,
        ) -> Result<(), NucleationError> {
            let data = self
                .0
                .to_animated_glb(&pack.0, &crate::meshing::MeshConfig::default(), fps)
                .map_err(|_| NucleationError::Mesh)?;
            super::write_b64(&data, out);
            Ok(())
        }
```

`ResourcePack` is already imported under `#[cfg(feature = "meshing")]` at the top of the bridge module; `write_b64` lives in `src/bridge/mod.rs` (used by `glb_data_b64`).

Run: `cargo check --quiet --features meshing && ./tools/gen-bindings.sh && grep -n "toAnimatedGlbB64" bindings/js/BuildAnimation.d.ts`
Expected: `toAnimatedGlbB64(pack: ResourcePack, fps: number): string;`

- [ ] **Step 2: JS test**

Append to `tests/node_build_animation_test.mjs` (import `ResourcePack` from "nucleation" and `readFileSync` is already imported):

```js
function glbJson(bytes) {
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "glTF");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
}

test("beacon: animated GLB carries named groups, anchor, and extras", () => {
  const packBytes = readFileSync(new URL("../apps/shared-pack/pack.zip", import.meta.url));
  const pack = ResourcePack.fromBytes(Array.from(packBytes));
  const animation = buildBeacon();
  const bytes = Uint8Array.from(Buffer.from(animation.toAnimatedGlbB64(pack, 30), "base64"));
  const json = glbJson(bytes);
  const names = json.nodes.map((node) => node.name);
  assert.equal(names[0], "build:beacon");
  assert.equal(names.filter((name) => name.startsWith("group:")).length, 10);
  assert.ok(names.includes("anchor:beacon"));
  assert.equal(json.animations[0].name, "beacon");
  assert.equal(json.nodes[0].extras.nucleation.groups, 10);
  assertClose(json.nodes[0].extras.nucleation.durationMs, 2400, "durationMs");
});
```

The verify script copies only the test file into the work dir; the pack path resolves through `import.meta.url` to the copied location, so also copy the pack: in `tools/verify-build-animation.sh` after the fixtures copy add `mkdir -p "$WORK_DIR/apps/shared-pack" && cp "$REPO_ROOT/apps/shared-pack/pack.zip" "$WORK_DIR/apps/shared-pack/"` — and since the test lives in `$WORK_DIR/javascript/`, the relative URL `../apps/shared-pack/pack.zip` resolves to `$WORK_DIR/apps/shared-pack/pack.zip`. Check the JS `ResourcePack.fromBytes` signature in `bindings/js/ResourcePack.d.ts` (the guide passes `Array.from(bytes)`).

- [ ] **Step 3: Python check**

Append to `tests/python_build_animation_test.py` before the final print:

```python
import base64
from nucleation import ResourcePack

pack_bytes = (Path(__file__).resolve().parents[1] / "apps" / "shared-pack" / "pack.zip").read_bytes()
pack = ResourcePack.from_bytes(list(pack_bytes))
glb = base64.b64decode(build_beacon().to_animated_glb_b64(pack, 30))
assert glb[:4] == b"glTF", "animated GLB magic"
json_len = int.from_bytes(glb[12:16], "little")
doc = json.loads(glb[20:20 + json_len])
assert doc["nodes"][0]["name"] == "build:beacon"
assert sum(1 for node in doc["nodes"] if node.get("name", "").startswith("group:")) == 10
```

Check the Python `ResourcePack.from_bytes` parameter type in `bindings/python/build/*/nucleation.pyi` (bytes vs list) and adapt.

- [ ] **Step 4: Rebuild everything and verify**

Run:
```bash
python3 tools/stage-python-sdist.py && .venv/bin/pip install ./bindings/python >/tmp/py.log 2>&1 || tail -20 /tmp/py.log
./tools/verify-build-animation.sh
```
Expected: `Build-animation parity passed: Rust fixtures, WASM/JS, Python`. The sdist staging copies `Cargo.toml` including the local `[patch]` with its absolute path, which is why the patch path must be absolute.

- [ ] **Step 5: Commit**

```bash
cargo fmt
git add src/bridge/animation.rs bindings/ tests/node_build_animation_test.mjs tests/python_build_animation_test.py tools/verify-build-animation.sh
git commit -m "feat(bridge): animated GLB export for build animations"
```

---

### Task 5: Documentation and release note

**Files:**
- Modify: `docs/features/animation.md` (after "## Anchors", before "## Determinism")
- Modify: `examples/readme/animation/engine.mjs`, `engine.py` (snippet `animated-glb`, guarded so the docs verification still runs without a pack — the engine examples have no pack; write the snippet as prose-verified code that only runs when `NUCLEATION_PACK` is set)
- Modify: `RELEASE_NOTES.md` (extend the "Unreleased" entry)

- [ ] **Step 1: Docs section**

````markdown
## Animated GLB

`toAnimatedGlbB64(pack, fps)` writes the whole build as one glTF binary that
any viewer can play: a root node `build:<name>`, one child `group:<id>` per
animation group with its textured mesh, translation/rotation/scale keyframe
tracks sampled at `fps` from the same timeline `frameJson` reads, and an
empty `anchor:<name>` child under the group each anchor belongs to. Constant
runs are deduplicated, so a long hold costs two keys.

What core glTF cannot animate rides in `extras.nucleation` and is ignored by
viewers that do not know it:

- root: `{ version, durationMs, fps, groups, camera: { times, yaw, pitch, zoom, targetOffset } | null }`
- group: `{ group, blocks, poseTrack: { times, opacity, tint, emissive } | null }`
- anchor: `{ anchor, group }`

=== "Python"

    ```python
    --8<-- "examples/readme/animation/engine.py:animated-glb"
    ```

=== "JavaScript"

    ```javascript
    --8<-- "examples/readme/animation/engine.mjs:animated-glb"
    ```
````

Snippets (JS; Python mirrors it with `os.environ.get("NUCLEATION_PACK")`):

```js
// --8<-- [start:animated-glb]
// One glTF binary any viewer can play: node per group, TRS tracks at 30 fps,
// anchors as child nodes, and `extras.nucleation` for what glTF cannot carry.
if (process.env.NUCLEATION_PACK) {
  const pack = ResourcePack.fromBytes(Array.from(readFileSync(process.env.NUCLEATION_PACK)));
  writeFileSync("engine_walkthrough.glb", Buffer.from(animation.toAnimatedGlbB64(pack, 30), "base64"));
}
// --8<-- [end:animated-glb]
```

Add the needed imports (`ResourcePack` from "nucleation", `readFileSync`/`writeFileSync` from "node:fs") at the top of `engine.mjs`, outside the snippet markers.

- [ ] **Step 2: Release note**

Extend the `# Unreleased` paragraph in `RELEASE_NOTES.md` with: "`BuildAnimation.to_animated_glb_b64(pack, fps)` exports the build as an animated GLB — named group nodes with textured meshes, TRS keyframes, anchor child nodes, and `extras.nucleation` for opacity/tint/emissive and camera tracks."

- [ ] **Step 3: Verify and commit**

Run: `./tools/verify-animation-docs.sh && ./tools/verify-build-animation.sh`
Expected: both success lines.

```bash
git add docs/features/animation.md examples/readme/animation/engine.mjs examples/readme/animation/engine.py RELEASE_NOTES.md
git commit -m "docs: animated GLB export"
```

---

### Task 6: Pin the mesher revision (needs the mesher commit on GitHub)

**Files:**
- Modify: `Cargo.toml` line 205 (`rev = "…"`) and `Cargo.lock`
- Remove: the uncommitted `[patch]` block from Task 2

This task is blocked until the `build-glb` mesher branch is pushed to `Schem-at/Schematic-Mesher` (the author's decision). When it is:

- [ ] **Step 1:** delete the `[patch."https://github.com/Schem-at/Schematic-Mesher.git"]` block; set `rev = "<Task 1 commit>"` on the `schematic-mesher` dependency.
- [ ] **Step 2:** `cargo update -p schematic-mesher && cargo test --quiet --features meshing --test build_animation_glb 2>&1 | grep "test result"` → PASS.
- [ ] **Step 3:** Commit only the dependency lines: `git add -p Cargo.toml` (select the `rev` hunk only — the author's other `Cargo.toml` edits stay unstaged) and `git add Cargo.lock`; `git commit -m "build: pin schematic-mesher with the build GLB exporter"`.

## Self-review notes

- Spec coverage: node convention, TRS sampling, dedupe, anchors as children, extras for pose colour and camera, bridge + bindings, docs. The `KHR_animation_pointer` alternative is deliberately not used (three.js does not load it); `poseTrack` in extras is the contract.
- The mesher gains a general exporter rather than a BuildAnimation-specific one, so other recorders can use it; the tick-timeline exporter is untouched.
- Names: gltf-json's `names` feature stays off; names are injected into the serialized JSON.
