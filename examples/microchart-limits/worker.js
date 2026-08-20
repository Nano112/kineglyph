import { microchart } from "@kineglyph/web/micro";

self.addEventListener("message", ({ data }) => {
  let bytes = 0;
  const started = performance.now();
  for (let index = 0; index < data.iterations; index += 1) {
    bytes += microchart(data.sample, data.types[index % data.types.length]).length;
  }
  const elapsed = performance.now() - started;
  self.postMessage({
    id: data.id,
    elapsed,
    rate: (data.iterations / elapsed) * 1000,
    averageBytes: Math.round(bytes / data.iterations),
  });
});
