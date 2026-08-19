/**
 * Renderer-neutral relational geometry for technical diagrams.
 *
 * The data says what should stay aligned, attached, measured, or annotated. A layout engine may
 * solve it directly or translate it into its own constraints; no callbacks or measured pixels are
 * stored in the IR.
 */

export type RelationalAxis = "x" | "y";
export type RelationalSide =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | "baseline";

export interface FractionalAnchor {
  readonly x: number;
  readonly y: number;
}

export type RelationalAnchor = RelationalSide | FractionalAnchor;
export type PortDirection = "input" | "output" | "bidirectional";
export type PortRole = "data" | "control" | "clock" | "power" | "ground" | "analog" | "custom";

export interface DiagramPort {
  readonly id: string;
  readonly anchor: RelationalAnchor;
  readonly direction?: PortDirection;
  readonly role?: PortRole;
  /** Logical signal width. One is a wire; values above one are buses. */
  readonly width?: number;
  readonly label?: string;
}

export interface RelationalNode {
  readonly id: string;
  readonly ports?: readonly DiagramPort[];
}

export interface PortReference {
  readonly node: string;
  readonly port?: string;
  readonly anchor?: RelationalAnchor;
}

export type RelationalConstraint =
  | {
      readonly kind: "align";
      readonly axis: RelationalAxis;
      readonly nodes: readonly string[];
      readonly at?: "start" | "center" | "end" | "baseline";
    }
  | {
      readonly kind: "distribute";
      readonly axis: RelationalAxis;
      readonly nodes: readonly string[];
      readonly gap?: number;
      readonly order?: "authored" | "ascending" | "descending";
    }
  | {
      readonly kind: "attach";
      readonly from: PortReference;
      readonly to: PortReference;
      readonly offset?: number;
    }
  | {
      readonly kind: "contain";
      readonly parent: string;
      readonly children: readonly string[];
      readonly padding?: number;
    }
  | {
      readonly kind: "distance";
      readonly from: PortReference;
      readonly to: PortReference;
      readonly value: number;
      readonly axis?: RelationalAxis;
    };

export type TechnicalAnnotation =
  | {
      readonly kind: "leader";
      readonly id: string;
      readonly label: string;
      readonly target: PortReference;
      readonly side?: RelationalSide;
      readonly elbow?: boolean;
    }
  | {
      readonly kind: "bracket";
      readonly id: string;
      readonly label?: string;
      readonly from: PortReference;
      readonly to: PortReference;
      readonly side?: "top" | "right" | "bottom" | "left";
      readonly style?: "square" | "round" | "brace";
    }
  | {
      readonly kind: "dimension";
      readonly id: string;
      readonly from: PortReference;
      readonly to: PortReference;
      readonly label?: string;
      readonly unit?: string;
      readonly offset?: number;
      readonly precision?: number;
    };

export interface RelationalDiagram {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly nodes: readonly RelationalNode[];
  readonly constraints?: readonly RelationalConstraint[];
  readonly annotations?: readonly TechnicalAnnotation[];
}

export interface RelationalDiagnostic {
  readonly code:
    | "duplicate-id"
    | "empty-id"
    | "unknown-node"
    | "unknown-port"
    | "invalid-anchor"
    | "invalid-constraint"
    | "invalid-port"
    | "invalid-annotation";
  readonly message: string;
  readonly path: string;
}

export interface RelationalValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly RelationalDiagnostic[];
}

export type PortOptions = Omit<DiagramPort, "id" | "anchor">;

function reference(node: string, port?: string): PortReference {
  return { node, ...(port === undefined ? {} : { port }) };
}

/** Short constructors that return the exact plain-data grammar above. */
export const rel = {
  anchor: (x: number, y: number): FractionalAnchor => ({ x, y }),
  port: (id: string, anchor: RelationalAnchor, options: PortOptions = {}): DiagramPort => ({
    id,
    anchor,
    ...options,
  }),
  ref: reference,
  at: (node: string, anchor: RelationalAnchor): PortReference => ({ node, anchor }),
  align: (
    axis: RelationalAxis,
    nodes: readonly string[],
    at: "start" | "center" | "end" | "baseline" = "center",
  ): RelationalConstraint => ({ kind: "align", axis, nodes, at }),
  distribute: (
    axis: RelationalAxis,
    nodes: readonly string[],
    options: {
      readonly gap?: number;
      readonly order?: "authored" | "ascending" | "descending";
    } = {},
  ): RelationalConstraint => ({ kind: "distribute", axis, nodes, ...options }),
  attach: (from: PortReference, to: PortReference, offset?: number): RelationalConstraint => ({
    kind: "attach",
    from,
    to,
    ...(offset === undefined ? {} : { offset }),
  }),
  contain: (
    parent: string,
    children: readonly string[],
    padding?: number,
  ): RelationalConstraint => ({
    kind: "contain",
    parent,
    children,
    ...(padding === undefined ? {} : { padding }),
  }),
  distance: (
    from: PortReference,
    to: PortReference,
    value: number,
    axis?: RelationalAxis,
  ): RelationalConstraint => ({
    kind: "distance",
    from,
    to,
    value,
    ...(axis === undefined ? {} : { axis }),
  }),
  leader: (
    id: string,
    label: string,
    target: PortReference,
    options: { readonly side?: RelationalSide; readonly elbow?: boolean } = {},
  ): TechnicalAnnotation => ({ kind: "leader", id, label, target, ...options }),
  bracket: (
    id: string,
    from: PortReference,
    to: PortReference,
    options: {
      readonly label?: string;
      readonly side?: "top" | "right" | "bottom" | "left";
      readonly style?: "square" | "round" | "brace";
    } = {},
  ): TechnicalAnnotation => ({ kind: "bracket", id, from, to, ...options }),
  dimension: (
    id: string,
    from: PortReference,
    to: PortReference,
    options: {
      readonly label?: string;
      readonly unit?: string;
      readonly offset?: number;
      readonly precision?: number;
    } = {},
  ): TechnicalAnnotation => ({ kind: "dimension", id, from, to, ...options }),
  diagram: (
    id: string,
    nodes: readonly RelationalNode[],
    options: {
      readonly constraints?: readonly RelationalConstraint[];
      readonly annotations?: readonly TechnicalAnnotation[];
    } = {},
  ): RelationalDiagram => ({ schemaVersion: 1, id, nodes, ...options }),
} as const;

function validAnchor(anchor: RelationalAnchor): boolean {
  return (
    typeof anchor === "string" ||
    (Number.isFinite(anchor.x) &&
      Number.isFinite(anchor.y) &&
      anchor.x >= 0 &&
      anchor.x <= 1 &&
      anchor.y >= 0 &&
      anchor.y <= 1)
  );
}

/** Validate all named relationships before a layout engine attempts to solve them. */
export function validateRelationalDiagram(diagram: RelationalDiagram): RelationalValidationResult {
  const diagnostics: RelationalDiagnostic[] = [];
  const report = (diagnostic: RelationalDiagnostic): void => {
    diagnostics.push(diagnostic);
  };
  const nodes = new Map<string, RelationalNode>();
  if (diagram.id.length === 0)
    report({ code: "empty-id", message: "diagram id must not be empty", path: "id" });
  diagram.nodes.forEach((node, nodeIndex) => {
    const path = `nodes[${nodeIndex}]`;
    if (node.id.length === 0)
      report({ code: "empty-id", message: "node id must not be empty", path: `${path}.id` });
    else if (nodes.has(node.id))
      report({
        code: "duplicate-id",
        message: `duplicate node id "${node.id}"`,
        path: `${path}.id`,
      });
    else nodes.set(node.id, node);
    const ports = new Set<string>();
    node.ports?.forEach((port, portIndex) => {
      const portPath = `${path}.ports[${portIndex}]`;
      if (port.id.length === 0)
        report({ code: "empty-id", message: "port id must not be empty", path: `${portPath}.id` });
      else if (ports.has(port.id))
        report({
          code: "duplicate-id",
          message: `node "${node.id}" has duplicate port "${port.id}"`,
          path: `${portPath}.id`,
        });
      ports.add(port.id);
      if (!validAnchor(port.anchor))
        report({
          code: "invalid-anchor",
          message: `port "${port.id}" anchor is outside 0..1`,
          path: `${portPath}.anchor`,
        });
      if (port.width !== undefined && (!Number.isInteger(port.width) || port.width < 1))
        report({
          code: "invalid-port",
          message: `port "${port.id}" width must be a positive integer`,
          path: `${portPath}.width`,
        });
    });
  });
  const checkReference = (value: PortReference, path: string): void => {
    const node = nodes.get(value.node);
    if (node === undefined) {
      report({
        code: "unknown-node",
        message: `${path} refers to unknown node "${value.node}"`,
        path,
      });
      return;
    }
    if (value.port !== undefined && !node.ports?.some((port) => port.id === value.port))
      report({
        code: "unknown-port",
        message: `${path} refers to unknown port "${value.node}.${value.port}"`,
        path,
      });
    if (value.anchor !== undefined && !validAnchor(value.anchor))
      report({ code: "invalid-anchor", message: `${path} has an anchor outside 0..1`, path });
  };
  const checkNode = (id: string, path: string): void => {
    if (!nodes.has(id))
      report({ code: "unknown-node", message: `${path} refers to unknown node "${id}"`, path });
  };
  diagram.constraints?.forEach((constraint, index) => {
    const path = `constraints[${index}]`;
    if (constraint.kind === "align" || constraint.kind === "distribute") {
      constraint.nodes.forEach((id) => checkNode(id, `${path}.nodes`));
      if (constraint.nodes.length < 2)
        report({
          code: "invalid-constraint",
          message: `${constraint.kind} needs at least two nodes`,
          path,
        });
      if (constraint.kind === "distribute" && constraint.gap !== undefined && constraint.gap < 0)
        report({
          code: "invalid-constraint",
          message: "distribution gap must be non-negative",
          path,
        });
    } else if (constraint.kind === "contain") {
      checkNode(constraint.parent, `${path}.parent`);
      constraint.children.forEach((id) => checkNode(id, `${path}.children`));
      if (constraint.padding !== undefined && constraint.padding < 0)
        report({
          code: "invalid-constraint",
          message: "contain padding must be non-negative",
          path,
        });
    } else {
      checkReference(constraint.from, `${path}.from`);
      checkReference(constraint.to, `${path}.to`);
      if (
        constraint.kind === "distance" &&
        (!Number.isFinite(constraint.value) || constraint.value < 0)
      )
        report({
          code: "invalid-constraint",
          message: "distance must be finite and non-negative",
          path,
        });
    }
  });
  const annotationIds = new Set<string>();
  diagram.annotations?.forEach((annotation, index) => {
    const path = `annotations[${index}]`;
    if (annotation.id.length === 0)
      report({ code: "empty-id", message: "annotation id must not be empty", path: `${path}.id` });
    else if (annotationIds.has(annotation.id) || nodes.has(annotation.id))
      report({
        code: "duplicate-id",
        message: `duplicate annotation id "${annotation.id}"`,
        path: `${path}.id`,
      });
    annotationIds.add(annotation.id);
    if (annotation.kind === "leader") checkReference(annotation.target, `${path}.target`);
    else {
      checkReference(annotation.from, `${path}.from`);
      checkReference(annotation.to, `${path}.to`);
    }
    if (
      annotation.kind === "dimension" &&
      annotation.precision !== undefined &&
      (!Number.isInteger(annotation.precision) ||
        annotation.precision < 0 ||
        annotation.precision > 12)
    )
      report({
        code: "invalid-annotation",
        message: "dimension precision must be 0 through 12",
        path,
      });
  });
  return { ok: diagnostics.length === 0, diagnostics };
}

/** Validate and retain the original serializable object. */
export function defineRelationalDiagram(diagram: RelationalDiagram): RelationalDiagram {
  const result = validateRelationalDiagram(diagram);
  if (!result.ok)
    throw new Error(
      `invalid relational diagram ${diagram.id || "(unnamed)"}:\n${result.diagnostics.map((entry) => `- ${entry.message}`).join("\n")}`,
    );
  return diagram;
}
