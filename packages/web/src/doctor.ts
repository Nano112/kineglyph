import { doctorResolvedScene, type DoctorFinding, type ResolvedScene } from "@kineglyph/core";

export interface DoctorLayers {
  readonly grid: boolean;
  readonly bounds: boolean;
  readonly ports: boolean;
  readonly edges: boolean;
  readonly findings: boolean;
}

export interface DoctorOverlayOptions {
  readonly visible?: boolean;
  readonly findings?: readonly DoctorFinding[];
  readonly layers?: Partial<DoctorLayers>;
}

export interface DoctorOverlayHandle {
  readonly element: HTMLDivElement;
  readonly visible: boolean;
  readonly layers: DoctorLayers;
  update(scene: ResolvedScene, findings?: readonly DoctorFinding[]): void;
  setVisible(visible: boolean): void;
  setLayers(layers: Partial<DoctorLayers>): void;
  destroy(): void;
}

const DEFAULT_LAYERS: DoctorLayers = {
  grid: true,
  bounds: true,
  ports: true,
  edges: true,
  findings: true,
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Responsive composition overlay: boxes, ports, edge routes, breakpoint, and doctor findings. */
export function mountDoctorOverlay(
  stage: HTMLElement,
  initial: ResolvedScene,
  options: DoctorOverlayOptions = {},
): DoctorOverlayHandle {
  const doc = stage.ownerDocument;
  const element = doc.createElement("div");
  element.className = "kg-doctor";
  const grid = doc.createElement("div");
  grid.className = "kg-doctor__grid";
  const routes = doc.createElementNS(SVG_NS, "svg");
  routes.classList.add("kg-doctor__routes");
  const bounds = doc.createElement("div");
  bounds.className = "kg-doctor__bounds";
  const panel = doc.createElement("details");
  panel.className = "kg-doctor__panel";
  const summary = doc.createElement("summary");
  const controls = doc.createElement("div");
  controls.className = "kg-doctor__layers";
  const list = doc.createElement("ol");
  panel.append(summary, controls, list);
  element.append(grid, routes, bounds, panel);
  stage.append(element);
  let visible = options.visible ?? true;
  let layers: DoctorLayers = { ...DEFAULT_LAYERS, ...options.layers };
  let scene = initial;
  let currentFindings = options.findings ?? doctorResolvedScene(initial);

  const render = (): void => {
    element.hidden = !visible;
    grid.hidden = !layers.grid;
    routes.toggleAttribute("hidden", !layers.edges);
    bounds.replaceChildren();
    routes.replaceChildren();
    list.replaceChildren();
    controls.replaceChildren();
    routes.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
    routes.setAttribute("preserveAspectRatio", "none");
    summary.textContent = `${scene.layout ?? "wide"} · ${Math.round(scene.width)}×${Math.round(scene.height)} · ${currentFindings.length} findings`;

    for (const key of Object.keys(DEFAULT_LAYERS) as (keyof DoctorLayers)[]) {
      const label = doc.createElement("label");
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.checked = layers[key];
      input.addEventListener("change", () => {
        layers = { ...layers, [key]: input.checked };
        render();
      });
      label.append(input, doc.createTextNode(key));
      controls.append(label);
    }

    const byNode = new Map<string, DoctorFinding[]>();
    if (layers.findings)
      for (const entry of currentFindings) {
        const item = doc.createElement("li");
        item.dataset.severity = entry.severity;
        const code = doc.createElement("strong");
        code.textContent = entry.code;
        const message = doc.createElement("span");
        message.textContent = entry.message;
        const remedy = doc.createElement("small");
        remedy.textContent = entry.remedy;
        item.append(code, message, remedy);
        list.append(item);
        if (entry.nodeId !== undefined) {
          const entries = byNode.get(entry.nodeId) ?? [];
          entries.push(entry);
          byNode.set(entry.nodeId, entries);
        }
      }

    if (layers.edges)
      for (const edge of scene.edges) {
        if (edge.hidden) continue;
        const path = doc.createElementNS(SVG_NS, "path");
        path.setAttribute("d", edge.path);
        path.dataset.edgeId = edge.id;
        routes.append(path);
      }

    if (layers.bounds || layers.ports || layers.findings)
      for (const node of scene.nodes) {
        if (node.hidden) continue;
        const entries = byNode.get(node.id) ?? [];
        if (layers.bounds || entries.length > 0) {
          const marker = doc.createElement("div");
          marker.className = "kg-doctor__box";
          marker.dataset.nodeId = node.id;
          marker.dataset.kind = node.kind;
          marker.dataset.severity = entries.some((entry) => entry.severity === "error")
            ? "error"
            : entries.some((entry) => entry.severity === "warning")
              ? "warning"
              : entries.length > 0
                ? "info"
                : "layout";
          marker.title =
            entries.length > 0
              ? entries.map((entry) => `${entry.code}: ${entry.message}`).join("\n")
              : `${node.id} · ${Math.round(node.width)}×${Math.round(node.height)}`;
          marker.style.left = `${(node.x / scene.width) * 100}%`;
          marker.style.top = `${(node.y / scene.height) * 100}%`;
          marker.style.width = `${(node.width / scene.width) * 100}%`;
          marker.style.height = `${(node.height / scene.height) * 100}%`;
          bounds.append(marker);
        }
        if (layers.ports)
          for (const port of node.ports ?? []) {
            const marker = doc.createElement("i");
            marker.className = "kg-doctor__port";
            marker.dataset.nodeId = node.id;
            marker.dataset.port = port.id;
            marker.title = `${node.id}.${port.id} · ${port.side} ${port.offset.toFixed(2)}`;
            marker.style.left = `${(port.x / scene.width) * 100}%`;
            marker.style.top = `${(port.y / scene.height) * 100}%`;
            bounds.append(marker);
          }
      }
    list.hidden = !layers.findings;
  };

  const update = (next: ResolvedScene, findings = doctorResolvedScene(next)): void => {
    scene = next;
    currentFindings = findings;
    render();
  };
  render();
  return {
    element,
    get visible() {
      return visible;
    },
    get layers() {
      return layers;
    },
    update,
    setVisible(next) {
      visible = next;
      element.hidden = !visible;
    },
    setLayers(next) {
      layers = { ...layers, ...next };
      render();
    },
    destroy: () => element.remove(),
  };
}
