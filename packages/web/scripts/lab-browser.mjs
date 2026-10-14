// Run after building @kineglyph/web. PLAYWRIGHT_MODULE may point at a local installation.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const out = process.env.BROWSER_EVIDENCE_DIR ?? "/tmp/kineglyph-lab-browser";
await mkdir(out, { recursive: true });
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px}figure{margin:0}</style><figure id="lab"></figure><script type="module">
import {mountKineglyphLab,figure} from '/kineglyph-web.js';
const scene=figure('test',{title:'Test'},f=>f.root(f.card({title:'Hello',body:'Browser regression'})));
window.lab=mountKineglyphLab(document.querySelector('#lab'),{source:'initial',view:'source',load:async()=>scene});
await window.lab.ready;window.ready=true;
</script>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
      return;
    }
    const filename = path.join(dist, path.basename(req.url.split("?")[0]));
    res.setHeader("Content-Type", "text/javascript");
    res.end(await readFile(filename));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const evidence = [];
try {
  for (const engine of ["chrome", "webkit"]) {
    const browser = await (engine === "chrome"
      ? chromium.launch({ channel: "chrome" })
      : webkit.launch());
    try {
      for (const width of [320, 390, 640, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.ready === true);
        const hitTests = await page.locator(".kg-lab__bar button").evaluateAll((buttons) =>
          buttons
            .filter((b) => b.getBoundingClientRect().width)
            .map((b) => {
              const r = b.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return {
                label: b.textContent,
                hit: hit?.closest("button")?.textContent,
                box: r.toJSON(),
              };
            }),
        );
        await page.screenshot({ path: `${out}/${engine}-${width}.png` });
        assert(
          hitTests.every((b) => b.label === b.hit),
          `${engine}/${width}: toolbar buttons obscured: ${JSON.stringify(hitTests)}`,
        );
        const source = page.getByRole("tab", { name: "Source", exact: true });
        const split = page.getByRole("tab", { name: "Editor + preview", exact: true });
        const preview = page.getByRole("tab", { name: "Preview", exact: true });
        await source.focus();
        await page.keyboard.press("ArrowRight");
        assert(await split.evaluate((e) => e === document.activeElement));
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("#lab").getAttribute("data-view"), "split");
        await page.keyboard.press("End");
        assert(await preview.evaluate((e) => e === document.activeElement));
        await page.keyboard.press("ArrowRight");
        assert(await source.evaluate((e) => e === document.activeElement));
        await page.keyboard.press("ArrowLeft");
        assert(await preview.evaluate((e) => e === document.activeElement));
        await page.keyboard.press("Home");
        assert(await source.evaluate((e) => e === document.activeElement));
        await page.keyboard.press("End");
        await page.keyboard.press("Space");
        assert.equal(await page.locator("#lab").getAttribute("data-view"), "preview");
        assert(
          await page
            .getByRole("button", { name: "Edit figure", exact: true })
            .evaluate((e) => e === document.activeElement),
        );
        await page.getByRole("button", { name: "Edit figure", exact: true }).click();
        await preview.click();
        assert.equal(await page.locator("#lab").getAttribute("data-view"), "preview");
        evidence.push({ engine, width, hitTests, keyboard: "passed", previewClick: "passed" });
        await writeFile(`${out}/results.json`, JSON.stringify(evidence, null, 2));
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log(`PASS: ${evidence.length} browser/viewport combinations; evidence ${out}`);
} finally {
  server.close();
}
