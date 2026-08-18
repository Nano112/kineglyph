// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mountAllMicrocharts, mountMicrochart, mountMicrochartBatch } from "../src/micro.js";

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
    controller.update([1, -2, 4], { type: "bar", negativeFill: "red" });
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
