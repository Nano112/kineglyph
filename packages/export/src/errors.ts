/** Stable machine-readable failure categories raised by the exporter. */
export type KineglyphExportErrorCode =
  | "invalid-time"
  | "invalid-output"
  | "missing-font"
  | "live-media"
  | "encoder"
  | "invalid-scene";

/** Error raised for every export failure that the caller can act on. */
export class KineglyphExportError extends Error {
  readonly code: KineglyphExportErrorCode;

  constructor(code: KineglyphExportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "KineglyphExportError";
    this.code = code;
  }
}

/** Narrowing helper for `catch` blocks. */
export function isKineglyphExportError(value: unknown): value is KineglyphExportError {
  return value instanceof KineglyphExportError;
}
