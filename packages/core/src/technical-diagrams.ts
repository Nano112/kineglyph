/** Serializable semantic grammar for circuits, timing, architecture, and explanatory diagrams. */
import {
  rel,
  validateRelationalDiagram,
  type DiagramPort,
  type PortReference,
  type RelationalConstraint,
  type TechnicalAnnotation,
} from "./relational.js";

export type TechnicalTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "muted";

export interface TechnicalItem {
  readonly id: string;
  readonly label?: string;
  readonly description?: string;
  readonly tone?: TechnicalTone;
}

export type SemanticGateKind =
  "and" | "or" | "xor" | "not" | "nand" | "nor" | "xnor" | "buffer" | "custom";
export type CircuitElementKind =
  "gate" | "junction" | "register" | "memory" | "clock" | "input" | "output" | "custom";

export interface CircuitElement extends TechnicalItem {
  readonly kind: CircuitElementKind;
  readonly gate?: SemanticGateKind;
  readonly ports: readonly DiagramPort[];
  readonly bits?: number;
  readonly symbol?: string;
}

export type NetKind = "signal" | "bus" | "clock" | "power" | "ground" | "analog";

export interface CircuitNet extends TechnicalItem {
  readonly kind: NetKind;
  readonly from: PortReference;
  readonly to: readonly PortReference[];
  readonly width?: number;
  readonly signal?: string;
  readonly animated?: boolean;
}

export interface CircuitDiagram {
  readonly schemaVersion: 1;
  readonly kind: "circuit";
  readonly id: string;
  readonly title?: string;
  readonly elements: readonly CircuitElement[];
  readonly nets: readonly CircuitNet[];
  readonly constraints?: readonly RelationalConstraint[];
  readonly annotations?: readonly TechnicalAnnotation[];
}

export type TimingLevel = number | "x" | "z";
export interface TimingSegment {
  readonly value: TimingLevel;
  readonly duration: number;
  readonly label?: string;
}

export interface TimingSignal extends TechnicalItem {
  readonly segments: readonly TimingSegment[];
  readonly radix?: 2 | 10 | 16;
}

export interface TimingMarker {
  readonly id: string;
  readonly at: number;
  readonly label?: string;
  readonly tone?: TechnicalTone;
}

export interface TimingDiagram {
  readonly schemaVersion: 1;
  readonly kind: "timing";
  readonly id: string;
  readonly title?: string;
  readonly unit?: string;
  readonly signals: readonly TimingSignal[];
  readonly markers?: readonly TimingMarker[];
}

export interface GraphNode extends TechnicalItem {
  readonly group?: string;
  readonly value?: string | number;
  readonly ports?: readonly DiagramPort[];
}

export interface GraphLink extends TechnicalItem {
  readonly from: string;
  readonly to: string;
  readonly directed?: boolean;
  readonly signal?: string;
}

export type GraphDiagramKind = "dataflow" | "dag" | "convergence";
export interface GraphDiagram {
  readonly schemaVersion: 1;
  readonly kind: GraphDiagramKind;
  readonly id: string;
  readonly title?: string;
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
  readonly direction?: "left-to-right" | "top-to-bottom";
}

export interface StateChartState extends TechnicalItem {
  readonly initial?: boolean;
  readonly terminal?: boolean;
  readonly parent?: string;
}

export interface StateChartTransition extends TechnicalItem {
  readonly from: string;
  readonly to: string;
  readonly event?: string;
  readonly guard?: string;
  readonly action?: string;
}

export interface StateChartDiagram {
  readonly schemaVersion: 1;
  readonly kind: "state-chart";
  readonly id: string;
  readonly title?: string;
  readonly states: readonly StateChartState[];
  readonly transitions: readonly StateChartTransition[];
  readonly direction?: "left-to-right" | "top-to-bottom";
}

export interface SequenceParticipant extends TechnicalItem {
  readonly role?: string;
}

export interface SequenceMessage extends TechnicalItem {
  readonly from: string;
  readonly to: string;
  readonly style?: "call" | "return" | "async" | "create" | "destroy";
  readonly order?: number;
}

export interface SequenceNote extends TechnicalItem {
  readonly over: readonly string[];
}

export interface SequenceDiagram {
  readonly schemaVersion: 1;
  readonly kind: "sequence";
  readonly id: string;
  readonly title?: string;
  readonly participants: readonly SequenceParticipant[];
  readonly messages: readonly SequenceMessage[];
  readonly notes?: readonly SequenceNote[];
}

export interface NeuralLayer extends TechnicalItem {
  readonly units: number;
  readonly activation?: string;
}

export interface NeuralConnection {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly weight?: number;
}

export interface NeuralDiagram {
  readonly schemaVersion: 1;
  readonly kind: "neural";
  readonly id: string;
  readonly title?: string;
  readonly layers: readonly NeuralLayer[];
  readonly connections: "dense" | readonly NeuralConnection[];
}

export interface MemoryCell {
  readonly address: string | number;
  readonly value: string | number | boolean | null;
  readonly label?: string;
  readonly changed?: boolean;
}

export interface MemoryDiagram {
  readonly schemaVersion: 1;
  readonly kind: "memory";
  readonly id: string;
  readonly title?: string;
  readonly columns?: readonly string[];
  readonly cells: readonly MemoryCell[];
  readonly wordSize?: number;
}

export interface RegisterDiagram {
  readonly schemaVersion: 1;
  readonly kind: "register";
  readonly id: string;
  readonly title?: string;
  readonly bits: readonly (0 | 1 | "x" | "z")[];
  readonly msbFirst?: boolean;
  readonly labels?: readonly string[];
}

export interface BufferItem extends TechnicalItem {
  readonly value?: string | number;
}

export interface BufferDiagram {
  readonly schemaVersion: 1;
  readonly kind: "buffer";
  readonly id: string;
  readonly title?: string;
  readonly capacity: number;
  readonly items: readonly BufferItem[];
  readonly discipline?: "fifo" | "lifo" | "ring" | "queue";
  readonly head?: number;
  readonly tail?: number;
}

export interface ComparisonColumn extends TechnicalItem {
  readonly emphasis?: boolean;
}

export interface ComparisonRow extends TechnicalItem {
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ComparisonDiagram {
  readonly schemaVersion: 1;
  readonly kind: "comparison";
  readonly id: string;
  readonly title?: string;
  readonly columns: readonly ComparisonColumn[];
  readonly rows: readonly ComparisonRow[];
}

export type TechnicalDiagram =
  | CircuitDiagram
  | TimingDiagram
  | GraphDiagram
  | StateChartDiagram
  | SequenceDiagram
  | NeuralDiagram
  | MemoryDiagram
  | RegisterDiagram
  | BufferDiagram
  | ComparisonDiagram;

export interface TechnicalDiagnostic {
  readonly code:
    "duplicate-id" | "unknown-reference" | "invalid-value" | "invalid-port" | "empty-diagram";
  readonly message: string;
  readonly path: string;
}

export interface TechnicalValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly TechnicalDiagnostic[];
}

function defaultGatePorts(kind: SemanticGateKind): readonly DiagramPort[] {
  const unary = kind === "not" || kind === "buffer";
  return [
    rel.port("a", unary ? "left" : rel.anchor(0, 0.3), {
      direction: "input",
      role: "data",
    }),
    ...(unary ? [] : [rel.port("b", rel.anchor(0, 0.7), { direction: "input", role: "data" })]),
    rel.port("y", "right", { direction: "output", role: "data" }),
  ];
}

function graph(
  kind: GraphDiagramKind,
  id: string,
  nodes: readonly GraphNode[],
  links: readonly GraphLink[],
  options?: { readonly title?: string; readonly direction?: GraphDiagram["direction"] },
): GraphDiagram {
  return {
    schemaVersion: 1,
    kind,
    id,
    nodes,
    links,
    ...(options?.title === undefined ? {} : { title: options.title }),
    ...(options?.direction === undefined ? {} : { direction: options.direction }),
  };
}

/** Constructors for the semantic grammar. All return JSON-safe plain data. */
export const technical = {
  gate: (
    id: string,
    kind: SemanticGateKind,
    options: Omit<CircuitElement, "id" | "kind" | "gate" | "ports"> & {
      readonly ports?: readonly DiagramPort[];
    } = {},
  ): CircuitElement => {
    const { ports, ...rest } = options;
    return { id, kind: "gate", gate: kind, ports: ports ?? defaultGatePorts(kind), ...rest };
  },
  junction: (
    id: string,
    options: Omit<CircuitElement, "id" | "kind" | "ports"> & {
      readonly ports?: readonly DiagramPort[];
    } = {},
  ): CircuitElement => {
    const { ports, ...rest } = options;
    return { id, kind: "junction", ports: ports ?? [], ...rest };
  },
  component: (
    id: string,
    kind: Exclude<CircuitElementKind, "gate" | "junction">,
    ports: readonly DiagramPort[],
    options: Omit<CircuitElement, "id" | "kind" | "ports"> = {},
  ): CircuitElement => ({ id, kind, ports, ...options }),
  net: (
    id: string,
    from: PortReference,
    to: PortReference | readonly PortReference[],
    options: Omit<CircuitNet, "id" | "kind" | "from" | "to"> & { readonly kind?: NetKind } = {},
  ): CircuitNet => {
    const { kind = "signal", ...rest } = options;
    return { id, kind, from, to: Array.isArray(to) ? to : [to as PortReference], ...rest };
  },
  bus: (
    id: string,
    width: number,
    from: PortReference,
    to: PortReference | readonly PortReference[],
    options: Omit<CircuitNet, "id" | "kind" | "width" | "from" | "to"> = {},
  ): CircuitNet => ({
    id,
    kind: "bus",
    width,
    from,
    to: Array.isArray(to) ? to : [to as PortReference],
    ...options,
  }),
  circuit: (
    id: string,
    elements: readonly CircuitElement[],
    nets: readonly CircuitNet[],
    options: Omit<CircuitDiagram, "schemaVersion" | "kind" | "id" | "elements" | "nets"> = {},
  ): CircuitDiagram => ({ schemaVersion: 1, kind: "circuit", id, elements, nets, ...options }),
  timingSignal: (
    id: string,
    segments: readonly TimingSegment[],
    options: Omit<TimingSignal, "id" | "segments"> = {},
  ): TimingSignal => ({ id, segments, ...options }),
  clock: (
    id: string,
    cycles: number,
    period = 2,
    options: Omit<TimingSignal, "id" | "segments"> = {},
  ): TimingSignal => ({
    id,
    segments: Array.from({ length: Math.max(0, Math.trunc(cycles)) * 2 }, (_, index) => ({
      value: index % 2 === 0 ? 0 : 1,
      duration: period / 2,
    })),
    ...options,
  }),
  timing: (
    id: string,
    signals: readonly TimingSignal[],
    options: Omit<TimingDiagram, "schemaVersion" | "kind" | "id" | "signals"> = {},
  ): TimingDiagram => ({ schemaVersion: 1, kind: "timing", id, signals, ...options }),
  stateChart: (
    id: string,
    states: readonly StateChartState[],
    transitions: readonly StateChartTransition[],
    options: Omit<
      StateChartDiagram,
      "schemaVersion" | "kind" | "id" | "states" | "transitions"
    > = {},
  ): StateChartDiagram => ({
    schemaVersion: 1,
    kind: "state-chart",
    id,
    states,
    transitions,
    ...options,
  }),
  sequence: (
    id: string,
    participants: readonly SequenceParticipant[],
    messages: readonly SequenceMessage[],
    options: Omit<
      SequenceDiagram,
      "schemaVersion" | "kind" | "id" | "participants" | "messages"
    > = {},
  ): SequenceDiagram => ({
    schemaVersion: 1,
    kind: "sequence",
    id,
    participants,
    messages,
    ...options,
  }),
  neural: (
    id: string,
    layers: readonly NeuralLayer[],
    options: Omit<NeuralDiagram, "schemaVersion" | "kind" | "id" | "layers" | "connections"> & {
      readonly connections?: NeuralDiagram["connections"];
    } = {},
  ): NeuralDiagram => {
    const { connections = "dense", ...rest } = options;
    return { schemaVersion: 1, kind: "neural", id, layers, connections, ...rest };
  },
  dataflow: (
    id: string,
    nodes: readonly GraphNode[],
    links: readonly GraphLink[],
    options?: Parameters<typeof graph>[4],
  ): GraphDiagram => graph("dataflow", id, nodes, links, options),
  dag: (
    id: string,
    nodes: readonly GraphNode[],
    links: readonly GraphLink[],
    options?: Parameters<typeof graph>[4],
  ): GraphDiagram => graph("dag", id, nodes, links, options),
  convergence: (
    id: string,
    nodes: readonly GraphNode[],
    links: readonly GraphLink[],
    options?: Parameters<typeof graph>[4],
  ): GraphDiagram => graph("convergence", id, nodes, links, options),
  memory: (
    id: string,
    cells: readonly MemoryCell[],
    options: Omit<MemoryDiagram, "schemaVersion" | "kind" | "id" | "cells"> = {},
  ): MemoryDiagram => ({ schemaVersion: 1, kind: "memory", id, cells, ...options }),
  register: (
    id: string,
    bits: readonly RegisterDiagram["bits"][number][],
    options: Omit<RegisterDiagram, "schemaVersion" | "kind" | "id" | "bits"> = {},
  ): RegisterDiagram => ({ schemaVersion: 1, kind: "register", id, bits, ...options }),
  buffer: (
    id: string,
    capacity: number,
    items: readonly BufferItem[],
    options: Omit<BufferDiagram, "schemaVersion" | "kind" | "id" | "capacity" | "items"> = {},
  ): BufferDiagram => ({ schemaVersion: 1, kind: "buffer", id, capacity, items, ...options }),
  comparison: (
    id: string,
    columns: readonly ComparisonColumn[],
    rows: readonly ComparisonRow[],
    options: Omit<ComparisonDiagram, "schemaVersion" | "kind" | "id" | "columns" | "rows"> = {},
  ): ComparisonDiagram => ({ schemaVersion: 1, kind: "comparison", id, columns, rows, ...options }),
} as const;

function duplicates(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  ids.forEach((id) => (seen.has(id) ? repeated.add(id) : seen.add(id)));
  return [...repeated];
}

/** Cross-reference and invariant checks shared by authoring, docs, and future compilers. */
export function validateTechnicalDiagram(diagram: TechnicalDiagram): TechnicalValidationResult {
  const diagnostics: TechnicalDiagnostic[] = [];
  const report = (code: TechnicalDiagnostic["code"], message: string, path: string): void => {
    diagnostics.push({ code, message, path });
  };
  if (diagram.id.length === 0) report("invalid-value", "diagram id must not be empty", "id");
  const checkUnique = (items: readonly TechnicalItem[], path: string): Set<string> => {
    duplicates(items.map((item) => item.id)).forEach((id) =>
      report("duplicate-id", `duplicate id "${id}"`, path),
    );
    return new Set(items.map((item) => item.id));
  };
  const checkLinks = (
    links: readonly { readonly id: string; readonly from: string; readonly to: string }[],
    ids: ReadonlySet<string>,
    path: string,
  ): void => {
    checkUnique(links, path);
    links.forEach((link, index) => {
      if (!ids.has(link.from))
        report("unknown-reference", `unknown source "${link.from}"`, `${path}[${index}].from`);
      if (!ids.has(link.to))
        report("unknown-reference", `unknown target "${link.to}"`, `${path}[${index}].to`);
    });
  };
  switch (diagram.kind) {
    case "circuit": {
      const ids = checkUnique(diagram.elements, "elements");
      checkUnique(diagram.nets, "nets");
      const relational = validateRelationalDiagram({
        schemaVersion: 1,
        id: diagram.id,
        nodes: diagram.elements,
        ...(diagram.constraints === undefined ? {} : { constraints: diagram.constraints }),
        ...(diagram.annotations === undefined ? {} : { annotations: diagram.annotations }),
      });
      relational.diagnostics.forEach((entry) =>
        report(
          entry.code === "unknown-node" || entry.code === "unknown-port"
            ? "unknown-reference"
            : "invalid-port",
          entry.message,
          entry.path,
        ),
      );
      const ports = new Map(
        diagram.elements.map((element) => [
          element.id,
          new Set(element.ports.map((port) => port.id)),
        ]),
      );
      const endpoint = (value: PortReference, path: string): void => {
        if (!ids.has(value.node))
          report("unknown-reference", `unknown circuit element "${value.node}"`, path);
        else if (value.port !== undefined && !ports.get(value.node)?.has(value.port))
          report("unknown-reference", `unknown circuit port "${value.node}.${value.port}"`, path);
      };
      diagram.nets.forEach((net, index) => {
        endpoint(net.from, `nets[${index}].from`);
        net.to.forEach((target, targetIndex) =>
          endpoint(target, `nets[${index}].to[${targetIndex}]`),
        );
        if (net.to.length === 0)
          report("invalid-value", `net "${net.id}" needs a target`, `nets[${index}].to`);
        const width = net.width ?? (net.kind === "bus" ? 0 : 1);
        if (!Number.isInteger(width) || width < 1)
          report(
            "invalid-value",
            `net "${net.id}" width must be a positive integer`,
            `nets[${index}].width`,
          );
      });
      break;
    }
    case "timing": {
      checkUnique(diagram.signals, "signals");
      if (diagram.signals.length === 0)
        report("empty-diagram", "timing diagram needs a signal", "signals");
      diagram.signals.forEach((signal, signalIndex) => {
        if (signal.segments.length === 0)
          report(
            "empty-diagram",
            `timing signal "${signal.id}" has no segments`,
            `signals[${signalIndex}].segments`,
          );
        signal.segments.forEach((segment, segmentIndex) => {
          if (!Number.isFinite(segment.duration) || segment.duration <= 0)
            report(
              "invalid-value",
              "timing duration must be finite and positive",
              `signals[${signalIndex}].segments[${segmentIndex}].duration`,
            );
        });
      });
      checkUnique(diagram.markers ?? [], "markers");
      diagram.markers?.forEach((marker, index) => {
        if (!Number.isFinite(marker.at) || marker.at < 0)
          report(
            "invalid-value",
            "timing marker must be finite and non-negative",
            `markers[${index}].at`,
          );
      });
      break;
    }
    case "dataflow":
    case "dag":
    case "convergence": {
      const ids = checkUnique(diagram.nodes, "nodes");
      checkLinks(diagram.links, ids, "links");
      if (diagram.nodes.length === 0)
        report("empty-diagram", `${diagram.kind} needs a node`, "nodes");
      if (diagram.kind === "dag") {
        const visiting = new Set<string>();
        const visited = new Set<string>();
        const outgoing = new Map<string, string[]>();
        diagram.links.forEach((link) =>
          outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link.to]),
        );
        const cycle = (id: string): boolean => {
          if (visiting.has(id)) return true;
          if (visited.has(id)) return false;
          visiting.add(id);
          if ((outgoing.get(id) ?? []).some(cycle)) return true;
          visiting.delete(id);
          visited.add(id);
          return false;
        };
        if (diagram.nodes.some((node) => cycle(node.id)))
          report("invalid-value", "DAG contains a cycle", "links");
      }
      break;
    }
    case "state-chart": {
      const ids = checkUnique(diagram.states, "states");
      checkLinks(diagram.transitions, ids, "transitions");
      if (!diagram.states.some((state) => state.initial))
        report("invalid-value", "state chart needs an initial state", "states");
      diagram.states.forEach((state, index) => {
        if (state.parent !== undefined && !ids.has(state.parent))
          report(
            "unknown-reference",
            `unknown parent state "${state.parent}"`,
            `states[${index}].parent`,
          );
      });
      break;
    }
    case "sequence": {
      const ids = checkUnique(diagram.participants, "participants");
      checkLinks(diagram.messages, ids, "messages");
      checkUnique(diagram.notes ?? [], "notes");
      diagram.notes?.forEach((note, index) =>
        note.over.forEach((participant) => {
          if (!ids.has(participant))
            report(
              "unknown-reference",
              `unknown participant "${participant}"`,
              `notes[${index}].over`,
            );
        }),
      );
      break;
    }
    case "neural": {
      const ids = checkUnique(diagram.layers, "layers");
      diagram.layers.forEach((layer, index) => {
        if (!Number.isInteger(layer.units) || layer.units < 1)
          report(
            "invalid-value",
            `layer "${layer.id}" units must be a positive integer`,
            `layers[${index}].units`,
          );
      });
      if (diagram.connections !== "dense")
        diagram.connections.forEach((connection, index) => {
          if (!ids.has(connection.from))
            report(
              "unknown-reference",
              `unknown layer "${connection.from}"`,
              `connections[${index}].from`,
            );
          if (!ids.has(connection.to))
            report(
              "unknown-reference",
              `unknown layer "${connection.to}"`,
              `connections[${index}].to`,
            );
        });
      break;
    }
    case "memory": {
      const addresses = diagram.cells.map((cell) => String(cell.address));
      duplicates(addresses).forEach((address) =>
        report("duplicate-id", `duplicate address "${address}"`, "cells"),
      );
      if (
        diagram.wordSize !== undefined &&
        (!Number.isInteger(diagram.wordSize) || diagram.wordSize < 1)
      )
        report("invalid-value", "memory wordSize must be a positive integer", "wordSize");
      break;
    }
    case "register":
      if (diagram.bits.length === 0)
        report("empty-diagram", "register needs at least one bit", "bits");
      if (diagram.labels !== undefined && diagram.labels.length !== diagram.bits.length)
        report("invalid-value", "register labels must match the bit count", "labels");
      break;
    case "buffer":
      checkUnique(diagram.items, "items");
      if (!Number.isInteger(diagram.capacity) || diagram.capacity < 1)
        report("invalid-value", "buffer capacity must be a positive integer", "capacity");
      if (diagram.items.length > diagram.capacity)
        report("invalid-value", "buffer contains more items than its capacity", "items");
      [diagram.head, diagram.tail].forEach((position, index) => {
        if (
          position !== undefined &&
          (!Number.isInteger(position) || position < 0 || position >= diagram.capacity)
        )
          report(
            "invalid-value",
            `buffer ${index === 0 ? "head" : "tail"} is outside its capacity`,
            index === 0 ? "head" : "tail",
          );
      });
      break;
    case "comparison": {
      const columns = checkUnique(diagram.columns, "columns");
      checkUnique(diagram.rows, "rows");
      diagram.rows.forEach((row, index) =>
        Object.keys(row.values).forEach((column) => {
          if (!columns.has(column))
            report(
              "unknown-reference",
              `row "${row.id}" refers to unknown column "${column}"`,
              `rows[${index}].values`,
            );
        }),
      );
      break;
    }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

/** Validate and retain a technical diagram definition. */
export function defineTechnicalDiagram<T extends TechnicalDiagram>(diagram: T): T {
  const result = validateTechnicalDiagram(diagram);
  if (!result.ok)
    throw new Error(
      `invalid technical diagram ${diagram.id || "(unnamed)"}:\n${result.diagnostics.map((entry) => `- ${entry.message}`).join("\n")}`,
    );
  return diagram;
}
