# Operational dashboard

This framework-free example demonstrates the intended dashboard boundary:

- HTML/CSS owns the application shell, filter, button, semantic table, and textual values.
- Full Kineglyph runtimes own the overview, percentile plot, dependency topology, gauges, and
  deployment/incident timeline.
- One batched microchart controller virtualizes and updates every table trend.
- One deterministic snapshot updates every instrument and stands in for the WebSocket adapter used
  in production.

Serve it locally:

```sh
npx vite .
```

The example imports the local workspace package so it also exercises unreleased primitives during
development. See `docs/operational-dashboards.md` for installed-package imports, WebSocket wiring,
backpressure, accessibility, export snapshots, and performance tiers.
