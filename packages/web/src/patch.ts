const ELEMENT_NODE = 1;

function elementKey(element: Element): string | undefined {
  for (const attribute of ["data-node-id", "data-edge-id", "data-surface-id", "id"] as const) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.length > 0) return `${attribute}:${value}`;
  }
  return undefined;
}

function compatible(current: Element, next: Element): boolean {
  return current.namespaceURI === next.namespaceURI && current.localName === next.localName;
}

function syncAttributes(current: Element, next: Element): void {
  for (const attribute of [...current.attributes])
    if (!next.hasAttributeNS(attribute.namespaceURI, attribute.localName))
      current.removeAttributeNS(attribute.namespaceURI, attribute.localName);
  for (const attribute of [...next.attributes]) {
    const value = current.getAttributeNS(attribute.namespaceURI, attribute.localName);
    if (value !== attribute.value)
      current.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
  }
}

/**
 * Reconciles one SVG/DOM subtree while retaining compatible elements with stable semantic ids.
 * The operation is intentionally deterministic and listener-safe: retained elements keep their
 * identity, while incompatible tag/namespace changes are replaced atomically.
 */
export function patchElement(current: Element, next: Element): Element {
  if (!compatible(current, next)) {
    const replacement = current.ownerDocument.importNode(next, true);
    current.replaceWith(replacement);
    return replacement;
  }
  syncAttributes(current, next);

  const nextChildren = [...next.childNodes];
  const keyed = new Map<string, Element>();
  for (const child of [...current.children]) {
    const key = elementKey(child);
    if (key !== undefined) keyed.set(key, child);
  }
  const retained = new Set<Node>();
  let cursor: ChildNode | null = current.firstChild;
  for (const nextChild of nextChildren) {
    let child: Node;
    if (nextChild.nodeType === ELEMENT_NODE) {
      const nextElement = nextChild as Element;
      const key = elementKey(nextElement);
      const keyedMatch = key === undefined ? undefined : keyed.get(key);
      const positional = cursor?.nodeType === ELEMENT_NODE ? (cursor as Element) : undefined;
      const match =
        keyedMatch !== undefined && compatible(keyedMatch, nextElement)
          ? keyedMatch
          : positional !== undefined &&
              elementKey(positional) === undefined &&
              compatible(positional, nextElement)
            ? positional
            : undefined;
      child =
        match === undefined
          ? current.ownerDocument.importNode(nextElement, true)
          : patchElement(match, nextElement);
    } else if (cursor !== null && cursor.nodeType === nextChild.nodeType) {
      child = cursor;
      if (child.nodeValue !== nextChild.nodeValue) child.nodeValue = nextChild.nodeValue;
    } else child = current.ownerDocument.importNode(nextChild, true);

    retained.add(child);
    if (child !== cursor) current.insertBefore(child, cursor);
    cursor = child.nextSibling;
  }
  for (const child of [...current.childNodes]) if (!retained.has(child)) child.remove();
  return current;
}

function svgFromMarkup(document: Document, markup: string): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const svg = template.content.firstElementChild;
  if (!(svg instanceof document.defaultView!.SVGSVGElement))
    throw new Error("Kineglyph renderer did not produce an SVG root");
  return svg;
}

/** Mounts the first SVG, then patches later frames by id without disturbing sibling overlays. */
export function patchStageSvg(stage: HTMLElement, markup: string): SVGSVGElement {
  const next = svgFromMarkup(stage.ownerDocument, markup);
  const current = stage.querySelector<SVGSVGElement>(":scope > svg");
  if (current === null) {
    stage.prepend(next);
    return next;
  }
  return patchElement(current, next) as SVGSVGElement;
}
