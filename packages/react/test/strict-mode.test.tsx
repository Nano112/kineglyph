// @vitest-environment jsdom

import { StrictMode, act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTheme, definePipeline } from "@kineglyph/core";
import { KineglyphFigure, type KineglyphFigureHandle } from "../src/index.js";

class TestResizeObserver implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element): void {
    this.#callback(
      [{ target, contentRect: { width: 390 } as DOMRectReadOnly } as ResizeObserverEntry],
      this,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
}

const mediaQuery = {
  matches: false,
  media: "(prefers-reduced-motion: reduce)",
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
} satisfies MediaQueryList;

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("matchMedia", () => mediaQuery);
  container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ width: 390, height: 600 }),
  });
  document.body.append(container);
});

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("KineglyphFigure in React StrictMode", () => {
  it("survives effect replay, remains visible at completion, and restarts", async () => {
    const figure = definePipeline({
      id: "strict-mode",
      title: "Strict mode figure",
      nodes: [{ id: "node", label: "Node", interactive: true }],
      edges: [],
      timeline: {
        duration: 240,
        tracks: [
          {
            id: "opacity",
            target: "node",
            property: "opacity",
            keyframes: [
              { time: 0, value: 0 },
              { time: 240, value: 1 },
            ],
          },
          {
            id: "scale",
            target: "node",
            property: "scale",
            keyframes: [
              { time: 0, value: 0.94 },
              { time: 240, value: 1 },
            ],
          },
        ],
      },
    });
    const handle = createRef<KineglyphFigureHandle>();
    root = createRoot(container);
    act(() => {
      root?.render(
        <StrictMode>
          <KineglyphFigure
            ref={handle}
            figure={figure}
            theme={createTheme()}
            autoplay
            controls={false}
          />
        </StrictMode>,
      );
    });

    const node = container.querySelector<SVGGElement>('[data-node-id="node"]');
    expect(node).not.toBeNull();
    await act(async () => {
      await vi.waitFor(() => expect(Number(node?.style.opacity)).toBeGreaterThan(0), {
        timeout: 1_000,
      });
    });
    expect(Number(node?.style.opacity)).toBeLessThan(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 280));
    });

    expect(node?.style.opacity).toBe("1");
    expect(node?.style.transform).toContain("scale(1)");

    act(() => handle.current?.restart());
    expect(node?.style.opacity).toBe("0");
    expect(node?.style.transform).toContain("scale(0.94)");

    await act(async () => {
      handle.current?.play();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(node?.style.opacity).toBe("1");
    expect(node?.style.transform).toContain("scale(1)");
  });
});
