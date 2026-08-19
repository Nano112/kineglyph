import { describe, expect, it, vi } from "vitest";
import { embedSvgFonts, svgTextCharacters } from "../src/fonts.js";

describe("standalone SVG font embedding", () => {
  it("embeds complete caller-owned font bytes in a deterministic defs style", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>AB</text></svg>';
    const output = await embedSvgFonts(svg, [
      {
        family: 'Demo "Mono"',
        data: new Uint8Array([0, 1, 2, 255]),
        format: "truetype",
        weight: 650,
        style: "normal",
        display: "swap",
        unicodeRange: "U+20-7E",
      },
    ]);
    expect(output).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><style data-kineglyph-fonts="true">' +
        '@font-face{font-family:"Demo \\"Mono\\"";src:url("data:font/ttf;base64,AAEC/w==") format("truetype");font-weight:650;font-style:normal;font-display:swap;unicode-range:U+20-7E}' +
        "</style></defs><text>AB</text></svg>",
    );
  });

  it("places rules inside existing defs and delegates real subsetting to the caller", async () => {
    const svg =
      '<svg><defs><linearGradient id="g"/></defs><text>A&amp;A<tspan>🙂B</tspan>&#x42;</text></svg>';
    const subset = vi.fn((_font, context: { readonly text: string }) => {
      expect(context.text).toBe("A&🙂B");
      return { data: new Uint8Array([9, 8, 7]), format: "woff" as const };
    });
    const output = await embedSvgFonts(
      svg,
      [{ family: "Subset", data: new Uint8Array([1, 2, 3]), format: "opentype" }],
      { subset },
    );
    expect(subset).toHaveBeenCalledOnce();
    expect(output).toContain(
      '<defs><style data-kineglyph-fonts="true">@font-face{font-family:"Subset";src:url("data:font/woff;base64,CQgH") format("woff")',
    );
    expect(output.indexOf("data-kineglyph-fonts")).toBeLessThan(output.indexOf("linearGradient"));
  });

  it("extracts unique Unicode characters in first-use order", () => {
    expect(svgTextCharacters("<svg><text>cab</text><text>b&#97; &lt;</text></svg>")).toBe("cab <");
  });

  it("expands a self-closing SVG root when embedding", async () => {
    expect(await embedSvgFonts("<svg/>", [{ family: "Tiny", data: new Uint8Array([1]) }])).toMatch(
      /^<svg><defs>.*<\/defs><\/svg>$/,
    );
  });

  it("rejects invalid documents, empty bytes, duplicate faces, and empty subset output", async () => {
    await expect(embedSvgFonts("nope", [])).rejects.toThrow(/not an SVG/);
    await expect(
      embedSvgFonts("<svg/>", [{ family: "Empty", data: new Uint8Array() }]),
    ).rejects.toThrow(/no bytes/);
    await expect(
      embedSvgFonts("<svg/>", [
        { family: "Same", data: new Uint8Array([1]) },
        { family: "Same", data: new Uint8Array([2]) },
      ]),
    ).rejects.toThrow(/duplicate face/);
    await expect(
      embedSvgFonts(
        "<svg><text>x</text></svg>",
        [{ family: "Subset", data: new Uint8Array([1]) }],
        { subset: () => new Uint8Array() },
      ),
    ).rejects.toThrow(/subsetter returned no bytes/);
  });
});
