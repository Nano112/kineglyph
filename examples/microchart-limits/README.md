# Microchart limits

A browser stress harness for the two distinct microchart costs:

- SVG string generation through `microchart()` in a worker, so the stress sample does not block
  input or the first paint.
- DOM mount and live updates through `mountMicrocharts()`.

The virtual mode represents up to 100,000 logical charts with a fixed pool of visible cells. The
eager mode deliberately mounts every SVG and is capped at 10,000 because its purpose is to expose
the browser DOM ceiling, not to recommend that architecture.

The virtualizer only recycles the pool after crossing a logical row boundary. It sizes its pool
from the actual viewport, keeps four overscan rows on each side, translates one layer instead of
every row, and preserves the current logical anchor when its column count changes.

The workload switch separates the common one-path line case from bars, four-segment polar charts,
and a deliberately hostile mixed workload whose pies and donuts also receive every selected sample.

The microchart cinema is a different stress profile: 24 persistent, labelled bar plots each contain
64 bars and aggregate two source scanlines (1,536 live bars). Its built-in reel is procedural, while
the local file picker decodes a reader-selected video entirely in the browser without uploading or
bundling that media.

```sh
npx vite examples/microchart-limits
```
