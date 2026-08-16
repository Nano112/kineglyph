// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createCodeDrawer, createParameterPanel } from "../src/controls.js";

describe("createParameterPanel", () => {
  it("formats values, reports input, and commits after the debounce", () => {
    vi.useFakeTimers();
    const inputChanges: number[] = [];
    const commits: number[] = [];
    const panel = createParameterPanel(document, {
      parameters: [{ id: "size", label: "Size", min: 1, max: 8, step: 0.1, value: 5.9 }],
      debounceMs: 120,
      onInput: ({ value }) => inputChanges.push(value),
      onChange: ({ value }) => commits.push(value),
    });
    const input = panel.element.querySelector<HTMLInputElement>("input");
    const output = panel.element.querySelector<HTMLOutputElement>("output");
    expect(input?.value).toBe("5.9");
    expect(output?.textContent).toBe("5.9");
    if (input === null) throw new Error("missing range input");
    input.value = "6.4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(inputChanges).toEqual([6.4]);
    expect(output?.textContent).toBe("6.4");
    expect(panel.values()).toEqual({ size: 6.4 });
    vi.advanceTimersByTime(119);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(commits).toEqual([6.4]);
    panel.destroy();
    vi.useRealTimers();
  });

  it("updates dynamic parameter definitions and validates ranges", () => {
    const panel = createParameterPanel(document, {
      parameters: [{ id: "detail", label: "Tube", min: 0.5, max: 2, step: 0.05, value: 1.25 }],
      onChange: () => undefined,
    });
    expect(panel.element.querySelector("output")?.textContent).toBe("1.25");
    panel.update([{ id: "detail", label: "Frame", min: 0.25, max: 1.5, step: 0.05, value: 0.85 }]);
    expect(panel.element.textContent).toContain("Frame");
    expect(panel.element.querySelector("output")?.textContent).toBe("0.85");
    expect(() =>
      panel.update([{ id: "bad", label: "Bad", min: 1, max: 1, step: 1, value: 1 }]),
    ).toThrow(/greater than min/);
    panel.destroy();
  });
});

describe("createParameterPanel form-state restoration", () => {
  it("keeps declared values over browser-restored input state", () => {
    const onChange = vi.fn();
    const panel = createParameterPanel(document, {
      parameters: [{ id: "pitch", label: "Pitch", min: 4, max: 10, step: 1, value: 6 }],
      onChange,
    });
    document.body.append(panel.element);
    const input = panel.element.querySelector("input")!;
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.defaultValue).toBe("6");
    // Simulate the browser writing stale state back into the control.
    input.value = "4";
    window.dispatchEvent(new Event("pageshow"));
    expect(input.value).toBe("6");
    expect(panel.element.querySelector("output")!.value).toBe("6");
    expect(panel.values()).toEqual({ pitch: 6 });
    expect(onChange).not.toHaveBeenCalled();
    panel.destroy();
  });
});

describe("createCodeDrawer", () => {
  it("switches samples and keeps the active language when code updates", () => {
    const drawer = createCodeDrawer(document, {
      samples: [
        { id: "python", label: "Python", code: "Sdf.sphere(4)" },
        { id: "javascript", label: "JavaScript", code: "Sdf.sphere(4);" },
      ],
    });
    expect(drawer.element.querySelector("code")?.textContent).toBe("Sdf.sphere(4)");
    const javascript = [...drawer.element.querySelectorAll("button")].find(
      (button) => button.textContent === "JavaScript",
    );
    javascript?.click();
    expect(drawer.element.querySelector("code")?.textContent).toBe("Sdf.sphere(4);");
    drawer.update([
      { id: "python", label: "Python", code: "Sdf.torus(4, 1)" },
      { id: "javascript", label: "JavaScript", code: "Sdf.torus(4, 1);" },
    ]);
    expect(drawer.element.querySelector("code")?.textContent).toBe("Sdf.torus(4, 1);");
    drawer.destroy();
  });
});
