import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "node:http";
import { createRenderHandler } from "../src/index.js";
import { chartUrl, parseQuery } from "../src/client.js";
import { parseRequest } from "../src/schema.js";
const server = createServer(createRenderHandler());
let base: string;
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
it.each(["anatomy", "anatomy-dark"] as const)(
  "serves %s via short URLs in SVG, PNG and GIF",
  async (theme) => {
    const input = { data: [12, 24, 18], width: 320, theme, fps: 2 };
    expect(parseRequest(input).theme).toBe(theme);
    for (const format of ["svg", "png", "gif"] as const) {
      const url = chartUrl(base, input, format);
      expect(url).not.toContain("spec=");
      expect(parseQuery(new URL(url).searchParams).theme).toBe(theme);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (format === "svg")
        expect(bytes.toString()).toContain(theme === "anatomy" ? "#f2f2ef" : "#0b0b0b");
      if (format === "png") {
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(bytes.readUInt32BE(16)).toBe(320);
      }
      if (format === "gif") expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
    }
  },
  20000,
);
it("rejects unknown Anatomy variants", () => {
  expect(() => parseRequest({ data: [1], theme: "anatomy-light" })).toThrow();
});
