/** A future deterministic raster export request. */
export interface RasterExportRequest {
  readonly format: "png" | "webp";
  readonly width: number;
  readonly scale?: number;
  readonly time?: number;
}

/**
 * Raster output is a deliberately explicit extension point in the first vertical slice.
 *
 * A later implementation will accept serialized SVG and use resvg with embedded font assets.
 * Keeping this contract free of a native/WASM dependency makes the interactive slice portable.
 */
export interface RasterExporter {
  export(request: RasterExportRequest): Promise<Uint8Array>;
}
