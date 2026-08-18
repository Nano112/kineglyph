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
import { useRef } from "react";

function Diagram({ scene }) {
  const ref = useRef<KineglyphFigureHandle>(null);
  return (
    <>
      <KineglyphFigure ref={ref} scene={scene} />
      <button onClick={() => ref.current?.seek(0)}>Replay</button>
    </>
  );
}
```

The ref exposes the same `KineglyphController` that [`@kineglyph/web`](../web) hands out — play,
pause, seek, inspect a node — so the imperative surface is identical whether or not React is in the
picture.

## Licence

MIT — see [LICENSE](./LICENSE).
