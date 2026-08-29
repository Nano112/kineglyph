// Shared by the build-animation sheets: load the Nucleation engine (a local sync of the npm
// package when present, the published one otherwise) and the docs' resource pack, and hand back
// the helpers every sheet needs. Kineglyph itself never imports Nucleation.
export async function loadNucleation({ pack = "build-pack.zip" } = {}) {
  const asset = (name) => new URL(name, import.meta.url).href;
  let nucleation;
  try {
    nucleation = await import(asset("engine/index.mjs"));
  } catch {
    nucleation = await import("https://cdn.jsdelivr.net/npm/nucleation@0.10.15/index.mjs");
  }
  const packBytes = new Uint8Array(await (await fetch(asset(pack))).arrayBuffer());
  const resourcePack = nucleation.ResourcePack.fromBytes(Array.from(packBytes));
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const glbOf = (animation, fps = 30) => bytes(animation.toAnimatedGlbB64(resourcePack, fps));
  // Export-menu entries for a build: the animated GLB and the finished build as schematics.
  // `animation` may be a function, for builds that are re-recorded while the sheet is open.
  const exportsOf = (animation, name) => {
    const current = () => (typeof animation === "function" ? animation() : animation);
    return [
      { label: "Download GLB", detail: "animated glTF · anchors as nodes", filename: `${name}.glb`, type: "model/gltf-binary", data: () => glbOf(current()) },
      { label: "Download .schem", detail: "Sponge schematic · finished build", filename: `${name}.schem`, data: () => bytes(current().toSchemB64()) },
      { label: "Download .litematic", detail: "Litematica · finished build", filename: `${name}.litematic`, data: () => bytes(current().toLitematicB64()) },
    ];
  };
  return { nucleation, pack: resourcePack, bytes, glbOf, exportsOf };
}
