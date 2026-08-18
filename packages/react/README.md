# @kineglyph/react

A React component for [Kineglyph](https://github.com/Nano112/kineglyph) figures. One component,
one ref, and the lifecycle handled: the figure mounts with the component, animates while it is on
screen, and disposes when React unmounts it.

```bash
npm install @kineglyph/react react react-dom
```

`react` and `react-dom` are peer dependencies (>=18) — this package will not pull a second copy of
React into your tree.

```tsx
import { KineglyphFigure, type KineglyphFigureHandle } from "@kineglyph/react";
import { defaultTheme } from "@kineglyph/core";
import { useRef, useState } from "react";

function Diagram({ scene }) {
  const ref = useRef<KineglyphFigureHandle>(null);
  const [signals, setSignals] = useState({ rate: "waiting" });
  return (
    <>
      <KineglyphFigure ref={ref} figure={scene} theme={defaultTheme} signals={signals} />
      <button onClick={() => ref.current?.restart()}>Replay</button>
      <button onClick={() => setSignals({ rate: "1,284 req/s" })}>Use sample data</button>
    </>
  );
}
```

Signal prop changes call `setSignals()` without remounting the scene. The ref also exposes the same
`KineglyphController` that [`@kineglyph/web`](../web) hands out—play, pause, seek, inspect, send
machine events, and push signals—so the imperative surface is identical whether or not React is in
the picture.

## Licence

MIT — see [LICENSE](./LICENSE).
