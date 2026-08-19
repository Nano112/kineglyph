/** Browser delivery helpers for already-rendered Kineglyph output. */

export type BrowserByteSource = Blob | ArrayBuffer | ArrayBufferView;

interface DownloadAnchor {
  href: string;
  download: string;
  rel: string;
  style: { display: string };
  click(): void;
  remove(): void;
}

interface DownloadDocument {
  readonly body?: { append(node: DownloadAnchor): void } | null;
  createElement(tag: "a"): DownloadAnchor;
}

interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

interface ClipboardWriter {
  write?(items: readonly ClipboardItem[]): Promise<void>;
  writeText?(text: string): Promise<void>;
}

interface ClipboardItemConstructor {
  new (items: Record<string, Blob>): ClipboardItem;
  supports?(type: string): boolean;
}

/** Injectable browser capabilities, primarily useful to hosts with a custom DOM realm. */
export interface BrowserExportEnvironment {
  readonly document?: DownloadDocument;
  readonly url?: ObjectUrlApi;
  readonly clipboard?: ClipboardWriter;
  readonly ClipboardItem?: ClipboardItemConstructor;
  readonly Blob?: typeof Blob;
  readonly queueMicrotask?: (callback: () => void) => void;
}

export interface DownloadBytesOptions {
  readonly filename: string;
  readonly type?: string;
  readonly environment?: BrowserExportEnvironment;
}

export interface CopyBytesOptions {
  readonly type: string;
  readonly environment?: BrowserExportEnvironment;
}

export interface CopySvgOptions {
  /** `auto` prefers a rich SVG clipboard item and falls back to plain source. */
  readonly format?: "auto" | "svg" | "text";
  readonly environment?: BrowserExportEnvironment;
}

function browserBlob(
  source: BrowserByteSource | string,
  type: string,
  environment: BrowserExportEnvironment,
): Blob {
  const BlobType = environment.Blob ?? globalThis.Blob;
  if (BlobType === undefined)
    throw new Error("Kineglyph export: Blob is unavailable in this environment");
  if (source instanceof BlobType && (type.length === 0 || source.type === type)) return source;
  const part: BlobPart =
    typeof source === "string"
      ? source
      : source instanceof ArrayBuffer
        ? source.slice(0)
        : source instanceof BlobType
          ? source
          : new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice().buffer;
  return new BlobType([part], type.length === 0 ? undefined : { type });
}

function downloadCapabilities(environment: BrowserExportEnvironment): {
  readonly document: DownloadDocument;
  readonly url: ObjectUrlApi;
  readonly queue: (callback: () => void) => void;
} {
  const nativeDocument = globalThis.document;
  const document =
    environment.document ??
    (nativeDocument === undefined
      ? undefined
      : {
          createElement: () => nativeDocument.createElement("a"),
          body:
            nativeDocument.body === null
              ? null
              : {
                  append: (node: DownloadAnchor) =>
                    nativeDocument.body.append(node as unknown as Node),
                },
        });
  const url = environment.url ?? globalThis.URL;
  if (document === undefined || typeof document.createElement !== "function")
    throw new Error("Kineglyph export: document is unavailable; downloads require a browser DOM");
  if (url === undefined || typeof url.createObjectURL !== "function")
    throw new Error("Kineglyph export: URL.createObjectURL is unavailable");
  return {
    document,
    url,
    queue: environment.queueMicrotask ?? globalThis.queueMicrotask.bind(globalThis),
  };
}

/**
 * Downloads existing bytes through a short-lived object URL.
 *
 * The URL is revoked in a microtask after the synthetic click, avoiding a retained Blob while still
 * giving the browser's download navigation a chance to consume it.
 */
export function downloadBytes(source: BrowserByteSource, options: DownloadBytesOptions): void {
  if (options.filename.trim().length === 0)
    throw new TypeError("Kineglyph export: download filename must not be empty");
  const environment = options.environment ?? {};
  const capabilities = downloadCapabilities(environment);
  const blob = browserBlob(source, options.type ?? "application/octet-stream", environment);
  const objectUrl = capabilities.url.createObjectURL(blob);
  const anchor = capabilities.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = options.filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  capabilities.document.body?.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    capabilities.queue(() => capabilities.url.revokeObjectURL(objectUrl));
  }
}

/** Downloads standalone SVG source with the correct MIME type. */
export function downloadSvg(
  svg: string,
  options: Omit<DownloadBytesOptions, "type"> & { readonly type?: "image/svg+xml" } = {
    filename: "figure.svg",
  },
): void {
  const environment = options.environment ?? {};
  const blob = browserBlob(svg, options.type ?? "image/svg+xml", environment);
  downloadBytes(blob, { ...options, type: options.type ?? "image/svg+xml" });
}

function clipboardCapabilities(environment: BrowserExportEnvironment): {
  readonly clipboard: ClipboardWriter;
  readonly ClipboardItem: ClipboardItemConstructor | undefined;
} {
  const clipboard = environment.clipboard ?? globalThis.navigator?.clipboard;
  if (clipboard === undefined)
    throw new Error("Kineglyph export: Clipboard API is unavailable in this environment");
  return { clipboard, ClipboardItem: environment.ClipboardItem ?? globalThis.ClipboardItem };
}

/** Writes binary output as one typed ClipboardItem. No text coercion is performed. */
export async function copyBytesToClipboard(
  source: BrowserByteSource,
  options: CopyBytesOptions,
): Promise<void> {
  if (options.type.trim().length === 0)
    throw new TypeError("Kineglyph export: clipboard MIME type must not be empty");
  const environment = options.environment ?? {};
  const { clipboard, ClipboardItem } = clipboardCapabilities(environment);
  if (clipboard.write === undefined || ClipboardItem === undefined)
    throw new Error("Kineglyph export: binary clipboard writes are unsupported in this browser");
  const blob = browserBlob(source, options.type, environment);
  await clipboard.write([new ClipboardItem({ [options.type]: blob })]);
}

/**
 * Copies standalone SVG as a rich `image/svg+xml` item when supported, otherwise as source text.
 * Set `format: "svg"` to require a rich item or `format: "text"` to skip capability detection.
 */
export async function copySvgToClipboard(svg: string, options: CopySvgOptions = {}): Promise<void> {
  const environment = options.environment ?? {};
  const { clipboard, ClipboardItem } = clipboardCapabilities(environment);
  const format = options.format ?? "auto";
  const richSupported =
    clipboard.write !== undefined &&
    ClipboardItem !== undefined &&
    (ClipboardItem.supports?.("image/svg+xml") ?? true);
  if (format !== "text" && richSupported) {
    const blob = browserBlob(svg, "image/svg+xml", environment);
    try {
      await clipboard.write?.([new ClipboardItem({ "image/svg+xml": blob })]);
      return;
    } catch (error) {
      if (format === "svg") throw error;
    }
  }
  if (format === "svg")
    throw new Error("Kineglyph export: SVG clipboard items are unsupported in this browser");
  if (clipboard.writeText === undefined)
    throw new Error("Kineglyph export: text clipboard writes are unsupported in this browser");
  await clipboard.writeText(svg);
}
