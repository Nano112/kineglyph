import { describe, expect, it } from "vitest";
import {
  copyBytesToClipboard,
  copySvgToClipboard,
  downloadBytes,
  downloadSvg,
  type BrowserExportEnvironment,
} from "../src/export.js";

function downloadHarness() {
  const clicked: string[] = [];
  const removed: string[] = [];
  const appended: unknown[] = [];
  const revoked: string[] = [];
  const blobs: Blob[] = [];
  const queued: (() => void)[] = [];
  const anchor = {
    href: "",
    download: "",
    rel: "",
    style: { display: "" },
    click: () => clicked.push(anchor.href),
    remove: () => removed.push(anchor.href),
  };
  const environment: BrowserExportEnvironment = {
    document: {
      body: { append: (node) => appended.push(node) },
      createElement: () => anchor,
    },
    url: {
      createObjectURL: (blob) => {
        blobs.push(blob);
        return `blob:test-${blobs.length}`;
      },
      revokeObjectURL: (url) => revoked.push(url),
    },
    queueMicrotask: (callback) => queued.push(callback),
  };
  return { anchor, appended, blobs, clicked, environment, queued, removed, revoked };
}

class TestClipboardItem {
  static supported = true;
  static supports(type: string): boolean {
    return this.supported && type === "image/svg+xml";
  }
  constructor(readonly items: Record<string, Blob>) {}
}

describe("browser export delivery", () => {
  it("downloads bytes, removes the anchor, and revokes its object URL in a microtask", async () => {
    const harness = downloadHarness();
    downloadBytes(new Uint8Array([1, 2, 3]), {
      filename: "figure.png",
      type: "image/png",
      environment: harness.environment,
    });
    expect(harness.anchor).toMatchObject({
      href: "blob:test-1",
      download: "figure.png",
      rel: "noopener",
      style: { display: "none" },
    });
    expect(harness.appended).toHaveLength(1);
    expect(harness.clicked).toEqual(["blob:test-1"]);
    expect(harness.removed).toEqual(["blob:test-1"]);
    expect(harness.revoked).toEqual([]);
    expect(harness.blobs[0]?.type).toBe("image/png");
    expect(new Uint8Array(await harness.blobs[0]!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    harness.queued[0]?.();
    expect(harness.revoked).toEqual(["blob:test-1"]);
  });

  it("downloads SVG source with a useful default filename", async () => {
    const harness = downloadHarness();
    downloadSvg("<svg/>", { filename: "diagram.svg", environment: harness.environment });
    expect(harness.anchor.download).toBe("diagram.svg");
    expect(harness.blobs[0]?.type).toBe("image/svg+xml");
    expect(await harness.blobs[0]?.text()).toBe("<svg/>");
  });

  it("writes typed bytes without silently coercing them to text", async () => {
    const writes: TestClipboardItem[][] = [];
    const environment: BrowserExportEnvironment = {
      clipboard: {
        write: (items) => {
          writes.push(items as unknown as TestClipboardItem[]);
          return Promise.resolve();
        },
      },
      ClipboardItem: TestClipboardItem as unknown as typeof ClipboardItem,
    };
    await copyBytesToClipboard(new Uint8Array([71, 73, 70]), {
      type: "image/gif",
      environment,
    });
    const item = writes[0]?.[0];
    expect(item?.items["image/gif"]?.type).toBe("image/gif");
    expect(new Uint8Array(await item!.items["image/gif"]!.arrayBuffer())).toEqual(
      new Uint8Array([71, 73, 70]),
    );
  });

  it("copies SVG richly when supported and predictably falls back to source text", async () => {
    const writes: TestClipboardItem[][] = [];
    const texts: string[] = [];
    const environment: BrowserExportEnvironment = {
      clipboard: {
        write: (items) => {
          writes.push(items as unknown as TestClipboardItem[]);
          return Promise.resolve();
        },
        writeText: (text) => {
          texts.push(text);
          return Promise.resolve();
        },
      },
      ClipboardItem: TestClipboardItem as unknown as typeof ClipboardItem,
    };
    await copySvgToClipboard('<svg id="rich"/>', { environment });
    expect(writes[0]?.[0]?.items["image/svg+xml"]?.type).toBe("image/svg+xml");
    TestClipboardItem.supported = false;
    await copySvgToClipboard('<svg id="text"/>', { environment });
    expect(texts).toEqual(['<svg id="text"/>']);
    await expect(copySvgToClipboard("<svg/>", { environment, format: "svg" })).rejects.toThrow(
      /unsupported/,
    );
    TestClipboardItem.supported = true;
  });

  it("falls back to text when a browser advertises SVG but rejects the rich item", async () => {
    const texts: string[] = [];
    const environment: BrowserExportEnvironment = {
      clipboard: {
        write: () => Promise.reject(new DOMException("unsupported", "NotSupportedError")),
        writeText: (text) => {
          texts.push(text);
          return Promise.resolve();
        },
      },
      ClipboardItem: TestClipboardItem as unknown as typeof ClipboardItem,
    };
    await copySvgToClipboard("<svg/>", { environment, format: "auto" });
    expect(texts).toEqual(["<svg/>"]);
  });
});
