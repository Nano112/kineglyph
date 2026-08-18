// @vitest-environment jsdom

import { StrictMode, act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTheme, definePipeline, defineScene } from "@kineglyph/core";
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

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 280));
    });

    expect(node?.style.opacity).toBe("1");
    expect(node?.style.transform).toBe("none");

    act(() => handle.current?.restart());
    expect(node?.style.opacity).toBe("0");
    expect(node?.style.transform).toContain("scale(0.94)");

    await act(async () => {
      handle.current?.play();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(node?.style.opacity).toBe("1");
    expect(node?.style.transform).toBe("none");
  });

  it("drives a scene state machine through the handle and its controls under StrictMode", () => {
    const scene = defineScene({
      schemaVersion: 2,
      id: "strict-lab",
      title: "Strict lab",
      description: "Machine-driven figure",
      machine: {
        id: "lab",
        initial: "idle",
        states: { idle: { on: { GO: "done" } }, done: { on: { RESET: "idle" } } },
        signals: { label: { match: { state: true }, cases: { done: "Done" }, default: "Idle" } },
      },
      root: {
        id: "root",
        type: "group",
        children: [{ id: "status", type: "text", text: "Idle", bind: { text: "label" } }],
      },
      controls: [
        { id: "go", label: "Go", event: "GO", activeWhen: { state: "done" } },
        { id: "reset", kind: "reset", label: "Reset" },
      ],
    });
    const handle = createRef<KineglyphFigureHandle>();
    root = createRoot(container);
    act(() => {
      root?.render(
        <StrictMode>
          <KineglyphFigure ref={handle} figure={scene} theme={createTheme()} autoplay={false} />
        </StrictMode>,
      );
    });
    const status = (): string =>
      container.querySelector('[data-node-id="status"] text')?.textContent ?? "";
    expect(status()).toBe("Idle");
    act(() => {
      handle.current?.send("GO");
    });
    expect(status()).toBe("Done");
    expect(handle.current?.controller?.state.machineState?.state).toBe("done");
    const go = container.querySelector<HTMLButtonElement>('[data-control="go"]');
    expect(go?.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-control="reset"]')?.click();
    });
    expect(status()).toBe("Idle");
    // StrictMode mounted twice; only one figure shell may remain.
    expect(container.querySelectorAll(".kg-figure")).toHaveLength(1);
    act(() => root?.unmount());
    root = undefined;
    expect(container.querySelectorAll(".kg-figure")).toHaveLength(0);
  });

  it("updates external signals through props and the imperative handle without remounting", () => {
    const scene = defineScene({
      schemaVersion: 2,
      id: "live-react",
      title: "Live React figure",
      signals: { value: "waiting" },
      root: {
        id: "root",
        type: "group",
        children: [{ id: "value", type: "text", text: "waiting", bind: { text: "value" } }],
      },
    });
    const theme = createTheme();
    const handle = createRef<KineglyphFigureHandle>();
    root = createRoot(container);
    act(() => {
      root?.render(
        <KineglyphFigure
          ref={handle}
          figure={scene}
          theme={theme}
          signals={{ value: "one" }}
          autoplay={false}
        />,
      );
    });
    const shell = container.querySelector(".kg-figure");
    const value = (): string =>
      container.querySelector('[data-node-id="value"] text')?.textContent ?? "";
    expect(value()).toBe("one");

    act(() => {
      root?.render(
        <KineglyphFigure
          ref={handle}
          figure={scene}
          theme={theme}
          signals={{ value: "two" }}
          autoplay={false}
        />,
      );
    });
    expect(value()).toBe("two");
    expect(container.querySelector(".kg-figure")).toBe(shell);

    act(() => handle.current?.setSignals({ value: "three" }));
    expect(value()).toBe("three");
  });
});
