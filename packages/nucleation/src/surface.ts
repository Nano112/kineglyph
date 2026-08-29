/**
 * A three.js live surface that plays a build's frame source on Kineglyph's clock.
 *
 * The surface never runs its own animation: every Kineglyph frame sets each group node's matrix
 * from `source.frame(time)`, the camera from the frame's camera pose on top of the base
 * configuration, and renders. `onView` / `view()` hand the resulting view-projection matrix and
 * viewport to whoever needs to project anchors — the frame-signal helper in `anchors.ts`.
 */
import { bindLiveSurface, type LiveSurfaceContext, type LiveSurfaceRenderer } from "@kineglyph/web";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ISOMETRIC, cameraMatrices, multiply, withPose, type CameraConfig } from "./camera.js";
import { fromAnimatedGlb, type FrameSource } from "./frame-source.js";
import { parseBuildGlb, type BuildGlb } from "./glb.js";

export type GlbBytes = Uint8Array | ArrayBuffer;

export interface BuildView {
  readonly time: number;
  /** Column-major view-projection of the last render. */
  readonly viewProjection: Float64Array;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly source: FrameSource;
}

export interface BuildSurfaceOptions {
  /** The animated build GLB, or a function that produces it after the scene has resolved. */
  readonly glb: GlbBytes | ((context: LiveSurfaceContext) => GlbBytes | Promise<GlbBytes>);
  /** Base camera; the frame's camera track is applied on top. Defaults to Nucleation's isometric. */
  readonly camera?: Partial<CameraConfig>;
  /** Let the viewer orbit with the pointer. The camera track stops driving once they grab it. */
  readonly interactive?: boolean;
  /** CSS colour behind the build; default transparent so the paper shows through. */
  readonly background?: string;
  /** Signals whose change rebuilds the model (the GLB function is called again). */
  readonly watch?: readonly string[];
  /**
   * Where poses come from. Defaults to the GLB's own tracks; pass
   * `(glb) => fromBuildAnimation(engine, glb)` to drive the renderer from a live engine.
   */
  readonly source?: (glb: BuildGlb) => FrameSource;
  readonly onView?: (view: BuildView) => void;
  readonly onError?: (error: unknown) => void;
}

export interface BuildSurface extends LiveSurfaceRenderer {
  /** The last rendered view, once the surface has rendered. */
  view(): BuildView | undefined;
  /** The frame source, once the GLB is loaded. */
  source(): FrameSource | undefined;
  /** The WebGL canvas (drawing buffer preserved), for compositing exports. */
  capture(): HTMLCanvasElement | undefined;
}

interface Target {
  readonly element: HTMLDivElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly root: THREE.Group;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  controls: OrbitControls | undefined;
  grabbed: boolean;
  source: FrameSource | undefined;
  glb: BuildGlb | undefined;
  groups: Map<number, THREE.Object3D>;
  materials: Map<number, THREE.MeshStandardMaterial[]>;
  lastTime: number;
  observer: ResizeObserver | undefined;
  refresh: (() => void) | undefined;
}

function toArrayBuffer(bytes: GlbBytes): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function loadGltf(loader: GLTFLoader, data: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.parse(data, "", (gltf) => resolve(gltf.scene), reject);
  });
}

function viewportOf(element: HTMLElement): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(element.clientWidth)),
    height: Math.max(1, Math.round(element.clientHeight)),
  };
}

/** A three.js renderer for an animated build GLB, driven by Kineglyph time. */
export function buildSurface(options: BuildSurfaceOptions): BuildSurface {
  let current: BuildView | undefined;
  let target: Target | undefined;
  const base: CameraConfig = { ...ISOMETRIC, ...options.camera };

  let rendering = false;
  const applyPoses = (t: Target, time: number): void => {
    if (t.source === undefined || rendering) return;
    rendering = true;
    try {
      renderFrame(t, time);
    } finally {
      rendering = false;
    }
  };

  const renderFrame = (t: Target, time: number): void => {
    if (t.source === undefined) return;
    const frame = t.source.frame(time);
    for (const [group, object] of t.groups) {
      const pose = frame.poses.get(group);
      if (pose === undefined) continue;
      object.matrixAutoUpdate = false;
      object.matrix.fromArray(pose.matrix);
      object.matrixWorldNeedsUpdate = true;
      const hidden = pose.opacity <= 0.001;
      object.visible = !hidden;
      for (const material of t.materials.get(group) ?? []) {
        material.opacity = pose.opacity;
        material.transparent = pose.opacity < 0.999 || material.alphaTest > 0;
        material.color.setRGB(pose.tint[0], pose.tint[1], pose.tint[2]);
        material.emissive.setRGB(pose.emissive[0], pose.emissive[1], pose.emissive[2]);
      }
    }
    const viewport = viewportOf(t.element);
    const aspect = viewport.width / viewport.height;
    let viewProjection: Float64Array;
    if (t.controls !== undefined && t.grabbed) {
      // OrbitControls has already moved the camera; reading it back here (never calling
      // `controls.update()`, which would dispatch `change` and re-enter) keeps the overlay in step.
      t.camera.updateMatrixWorld();
      t.camera.matrixWorldInverse.copy(t.camera.matrixWorld).invert();
      viewProjection = multiply(
        Float64Array.from(t.camera.projectionMatrix.elements),
        Float64Array.from(t.camera.matrixWorldInverse.elements),
      );
    } else {
      const config = withPose(base, frame.camera, t.source.bounds);
      const matrices = cameraMatrices(t.source.bounds, aspect, config);
      const camera = t.camera;
      camera.matrixAutoUpdate = false;
      camera.matrixWorldAutoUpdate = false;
      camera.matrixWorldInverse.fromArray(matrices.view);
      camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
      camera.matrix.copy(camera.matrixWorld);
      camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
      camera.projectionMatrix.fromArray(matrices.projection);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      if (t.controls !== undefined) {
        t.controls.target.set(matrices.center[0], matrices.center[1], matrices.center[2]);
      }
      viewProjection = matrices.viewProjection;
    }
    t.renderer.render(t.scene, t.camera);
    t.lastTime = time;
    current = { time, viewProjection, viewport, source: t.source };
    options.onView?.(current);
  };

  const loadModel = async (t: Target, context: LiveSurfaceContext): Promise<void> => {
    const bytes = typeof options.glb === "function" ? await options.glb(context) : options.glb;
    if (context.signal.aborted) return;
    const glb = parseBuildGlb(bytes);
    const model = await loadGltf(new GLTFLoader(), toArrayBuffer(glb.bytes));
    if (context.signal.aborted) return;
    t.root.clear();
    for (const materials of t.materials.values())
      for (const material of materials) material.dispose();
    t.groups = new Map();
    t.materials = new Map();
    // GLTFLoader sanitises node names (":" is dropped), so nodes are matched by walking the
    // parsed hierarchy and the three.js hierarchy in lock-step (`findNode`).
    for (const group of glb.groups) {
      const object = findNode(model, glb, group.index);
      if (object === undefined) continue;
      t.groups.set(group.group, object);
      const materials: THREE.MeshStandardMaterial[] = [];
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const list = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of list) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          if (material.map !== null) {
            material.map.magFilter = THREE.NearestFilter;
            material.map.minFilter = THREE.NearestFilter;
            material.map.generateMipmaps = false;
            material.map.needsUpdate = true;
          }
          material.metalness = 0;
          material.roughness = 1;
          material.needsUpdate = true;
          materials.push(material);
        }
      });
      t.materials.set(group.group, materials);
    }
    t.root.add(model);
    t.glb = glb;
    t.source = options.source?.(glb) ?? fromAnimatedGlb(glb);
  };

  const renderer: LiveSurfaceRenderer = bindLiveSurface<Target>({
    watch: options.watch ?? [],
    includeTime: true,
    mount(context) {
      const element = context.element;
      const gl = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      gl.setPixelRatio(element.ownerDocument.defaultView?.devicePixelRatio ?? 1);
      const viewport = viewportOf(element);
      gl.setSize(viewport.width, viewport.height, false);
      gl.domElement.style.display = "block";
      gl.domElement.style.width = "100%";
      gl.domElement.style.height = "100%";
      if (options.background !== undefined && options.background !== "transparent")
        gl.setClearColor(new THREE.Color(options.background), 1);
      else gl.setClearColor(0x000000, 0);
      element.append(gl.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(0.6, 1, 0.4);
      scene.add(sun);
      const root = new THREE.Group();
      scene.add(root);
      const camera =
        base.projection === "perspective"
          ? new THREE.PerspectiveCamera(base.fovDeg, viewport.width / viewport.height, 0.1, 100)
          : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
      const t: Target = {
        element,
        renderer: gl,
        scene,
        root,
        camera,
        controls: undefined,
        grabbed: false,
        source: undefined,
        glb: undefined,
        groups: new Map(),
        materials: new Map(),
        lastTime: 0,
        observer: undefined,
        refresh: context.refresh,
      };
      if (options.interactive === true) {
        const controls = new OrbitControls(camera, gl.domElement);
        controls.enableDamping = false;
        controls.addEventListener("start", () => {
          if (t.grabbed) return;
          t.grabbed = true;
          camera.matrixAutoUpdate = true;
          camera.matrixWorldAutoUpdate = true;
          if (camera instanceof THREE.OrthographicCamera && t.source !== undefined) {
            const viewportNow = viewportOf(element);
            const matrices = cameraMatrices(
              t.source.bounds,
              viewportNow.width / viewportNow.height,
              withPose(base, t.source.frame(t.lastTime).camera, t.source.bounds),
            );
            const ortho = matrices.ortho;
            if (ortho !== undefined) {
              camera.left = -ortho.halfWidth;
              camera.right = ortho.halfWidth;
              camera.top = ortho.halfHeight;
              camera.bottom = -ortho.halfHeight;
              camera.near = ortho.near;
              camera.far = ortho.far;
              camera.updateProjectionMatrix();
            }
          }
        });
        controls.addEventListener("change", () => {
          if (t.grabbed) applyPoses(t, t.lastTime);
        });
        t.controls = controls;
      }
      const view = element.ownerDocument.defaultView;
      if (view !== null && "ResizeObserver" in view) {
        t.observer = new view.ResizeObserver(() => {
          const size = viewportOf(element);
          gl.setSize(size.width, size.height, false);
          if (camera instanceof THREE.PerspectiveCamera && t.grabbed) {
            camera.aspect = size.width / size.height;
            camera.updateProjectionMatrix();
          }
          if (t.source !== undefined) applyPoses(t, t.lastTime);
        });
        t.observer.observe(element);
      }
      target = t;
      return t;
    },
    async apply(t, update, signal) {
      if (signal.aborted) return;
      try {
        const reload =
          update.initial || update.changed.some((name) => (options.watch ?? []).includes(name));
        if (reload) {
          await loadModel(t, {
            element: t.element,
            node: update.node,
            scene: update.scene,
            theme: update.scene.theme as unknown as LiveSurfaceContext["theme"],
            machineState: update.machineState,
            signals: update.signals,
            time: update.time,
            playing: false,
            signal,
            send: () => undefined,
          });
        }
        if (signal.aborted) return;
        applyPoses(t, update.time);
        // A new model changes what the frame signals report; ask the figure to re-apply now.
        if (reload) t.refresh?.();
      } catch (error) {
        options.onError?.(error);
        throw error;
      }
    },
    capture(t: Target, time: number) {
      if (t.source === undefined) return undefined;
      applyPoses(t, time);
      return t.renderer.domElement;
    },
    destroy(t) {
      t.observer?.disconnect();
      t.controls?.dispose();
      for (const materials of t.materials.values())
        for (const material of materials) material.dispose();
      t.root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.geometry instanceof THREE.BufferGeometry)
          object.geometry.dispose();
      });
      t.renderer.dispose();
      t.renderer.domElement.remove();
      if (target === t) target = undefined;
      current = undefined;
    },
  });

  return Object.assign(renderer, {
    view: () => current,
    source: () => target?.source,
    capture: () => target?.renderer.domElement,
  });
}

/**
 * Find the Object3D for a glTF node index. GLTFLoader builds objects in node order under the
 * scene root and sanitises names, so walk the parsed hierarchy and the three.js hierarchy in
 * lock-step from the root build node.
 */
function findNode(model: THREE.Group, glb: BuildGlb, index: number): THREE.Object3D | undefined {
  const rootObject = model.children[0];
  if (rootObject === undefined) return undefined;
  const walk = (object: THREE.Object3D, nodeIndex: number): THREE.Object3D | undefined => {
    if (nodeIndex === index) return object;
    const node = glb.nodes[nodeIndex];
    if (node === undefined) return undefined;
    for (let i = 0; i < node.children.length; i += 1) {
      const childIndex = node.children[i];
      const childObject = object.children[i];
      if (childIndex === undefined || childObject === undefined) continue;
      const found = walk(childObject, childIndex);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(rootObject, glb.root.index);
}
