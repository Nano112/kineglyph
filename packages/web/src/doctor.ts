import { doctorResolvedScene, type DoctorFinding, type ResolvedScene } from "@kineglyph/core";

export interface DoctorOverlayOptions {
  readonly visible?: boolean;
  readonly findings?: readonly DoctorFinding[];
}

export interface DoctorOverlayHandle {
  readonly element: HTMLDivElement;
  readonly visible: boolean;
  update(scene: ResolvedScene, findings?: readonly DoctorFinding[]): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/** Bounds/diagnostic overlay used by editable examples and application development builds. */
export function mountDoctorOverlay(
  stage: HTMLElement,
  initial: ResolvedScene,
  options: DoctorOverlayOptions = {},
): DoctorOverlayHandle {
  const doc = stage.ownerDocument;
  const element = doc.createElement("div");
  element.className = "kg-doctor";
  const bounds = doc.createElement("div");
  bounds.className = "kg-doctor__bounds";
  const panel = doc.createElement("details");
  panel.className = "kg-doctor__panel";
  const summary = doc.createElement("summary");
  const list = doc.createElement("ol");
  panel.append(summary, list);
  element.append(bounds, panel);
  stage.append(element);
  let visible = options.visible ?? true;
  let scene = initial;

  const render = (findings: readonly DoctorFinding[]): void => {
    element.hidden = !visible;
    bounds.replaceChildren();
    list.replaceChildren();
    summary.textContent = `Doctor · ${findings.length}`;
    const byNode = new Map<string, DoctorFinding[]>();
    for (const entry of findings) {
      const item = doc.createElement("li");
      item.dataset.severity = entry.severity;
      item.innerHTML = `<strong>${entry.code}</strong><span>${entry.message}</span><small>${entry.remedy}</small>`;
      list.append(item);
      if (entry.nodeId !== undefined) {
        const entries = byNode.get(entry.nodeId) ?? [];
        entries.push(entry);
        byNode.set(entry.nodeId, entries);
      }
    }
    for (const [nodeId, entries] of byNode) {
      const node = scene.nodes.find((candidate) => candidate.id === nodeId);
      if (node === undefined) continue;
      const marker = doc.createElement("div");
      marker.className = "kg-doctor__box";
      marker.dataset.nodeId = nodeId;
      marker.dataset.severity = entries.some((entry) => entry.severity === "error")
        ? "error"
        : entries.some((entry) => entry.severity === "warning")
          ? "warning"
          : "info";
      marker.title = entries.map((entry) => `${entry.code}: ${entry.message}`).join("\n");
      marker.style.left = `${(node.x / scene.width) * 100}%`;
      marker.style.top = `${(node.y / scene.height) * 100}%`;
      marker.style.width = `${(node.width / scene.width) * 100}%`;
      marker.style.height = `${(node.height / scene.height) * 100}%`;
      bounds.append(marker);
    }
  };
  const update = (next: ResolvedScene, findings = doctorResolvedScene(next)): void => {
    scene = next;
    render(findings);
  };
  update(initial, options.findings);
  return {
    element,
    get visible() {
      return visible;
    },
    update,
    setVisible(next) {
      visible = next;
      element.hidden = !visible;
    },
    destroy: () => element.remove(),
  };
}
