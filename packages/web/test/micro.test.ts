// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  microchart,
  mountAllMicrocharts,
  mountMicrochart,
  mountMicrochartBatch,
  mountMicrocharts,
} from "../src/micro.js";

describe("microchart DOM helpers", () => {
  it("mounts, updates, and restores a tiny inline chart", () => {
    const element = document.createElement("span");
    element.textContent = "5,3,9";
    const controller = mountMicrochart(element, element.textContent, {
      type: "line",
      label: "Recent latency",
    });
    expect(element.dataset.kineglyphMicrochart).toBe("line");
    expect(element.querySelector("svg")?.getAttribute("aria-label")).toBe("Recent latency");
    const svg = element.querySelector("svg");
    const path = element.querySelector("path");
    controller.update([9, 4, 1]);
    expect(element.querySelector("svg")).toBe(svg);
    expect(element.querySelector("path")).toBe(path);
    controller.update([1, -2, 4], { type: "bar", negativeFill: "red" });
    expect(element.querySelector("svg")).toBe(svg);
    expect(element.querySelectorAll("rect")).toHaveLength(3);
    expect(controller.values).toEqual([1, -2, 4]);
    controller.destroy();
    expect(element.textContent).toBe("5,3,9");
    expect(() => controller.update([1])).toThrow(/destroyed/);
  });

  it("enhances declarative table cells", () => {
    document.body.innerHTML = `
      <span data-kineglyph-microchart="line" aria-label="Trend">1,4,2</span>
      <span data-kineglyph-microchart="bar" data-width="48">2,-1,3</span>`;
    const controllers = mountAllMicrocharts();
    expect(controllers).toHaveLength(2);
    expect(document.querySelectorAll("svg")).toHaveLength(2);
    expect(document.querySelectorAll("rect")).toHaveLength(3);
  });

  it("mounts and updates a collection through concise keyed helpers", () => {
    document.body.innerHTML = `<section id="services">
      <span data-kineglyph-microchart data-kineglyph-key="api">1,2,3</span>
      <span id="worker" data-kineglyph-microchart="bar">2,3,4</span>
    </section>`;
    const charts = mountMicrocharts("#services", { defer: false, strokeWidth: 2 });
    expect(charts.size).toBe(2);
    expect(charts.mounted).toBe(2);
    charts.set("api", [3, 2, 1]);
    charts.setMany({ api: [4, 5, 6], worker: [1, -1, 2] });
    charts.flush();
    expect(document.querySelector('[data-kineglyph-key="api"] path')?.getAttribute("d")).toContain(
      "M0 16",
    );
    expect(document.querySelectorAll("#worker rect")).toHaveLength(3);
    expect(microchart([1, 2, 1])).toContain("<path");
    charts.destroy();
  });

  it("virtualizes thousands of cells with one observer and batches dirty updates", () => {
    let callback: IntersectionObserverCallback | undefined;
    const observed: Element[] = [];
    let disconnected = false;
    class FakeObserver {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe(target: Element): void {
        observed.push(target);
      }
      disconnect(): void {
        disconnected = true;
      }
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      readonly root = null;
      readonly rootMargin = "160px 0px";
      readonly thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    document.body.innerHTML = Array.from(
      { length: 2_000 },
      (_, index) =>
        `<span data-kineglyph-microchart="line">${index % 7},${(index + 2) % 11},${(index + 4) % 13}</span>`,
    ).join("");

    const batch = mountMicrochartBatch();
    expect(batch.size).toBe(2_000);
    expect(batch.mounted).toBe(0);
    expect(observed).toHaveLength(2_000);
    expect(document.querySelectorAll("svg")).toHaveLength(0);

    const visible = observed.slice(0, 24);
    callback?.(
      visible.map(
        (target) =>
          ({ target, isIntersecting: true, intersectionRatio: 1 }) as IntersectionObserverEntry,
      ),
      {} as IntersectionObserver,
    );
    batch.flush();
    expect(batch.mounted).toBe(24);
    expect(document.querySelectorAll("svg")).toHaveLength(24);

    const first = visible[0] as HTMLElement;
    const before = first.querySelector("path")?.getAttribute("d");
    batch.update(0, [1, 4, 9]);
    batch.update(0, [9, 4, 1]);
    batch.flush();
    expect(first.querySelector("path")?.getAttribute("d")).not.toBe(before);
    expect(first.querySelector("path")?.getAttribute("d")).toContain("M0 0");

    callback?.(
      [
        {
          target: first,
          isIntersecting: false,
          intersectionRatio: 0,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(batch.mounted).toBe(23);
    expect(first.querySelector("svg")).toBeNull();
    expect(first.dataset.kineglyphMicrochart).toBe("line");

    batch.update(first, [2, 8, 3]);
    callback?.(
      [
        {
          target: first,
          isIntersecting: true,
          intersectionRatio: 1,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    batch.flush();
    expect(first.querySelector("path")?.getAttribute("d")).toContain("M0 16");

    batch.destroy();
    expect(disconnected).toBe(true);
    expect(document.querySelectorAll("svg")).toHaveLength(0);
    expect(() => batch.update(0, [1])).toThrow(/destroyed/);
    vi.unstubAllGlobals();
  });
});
