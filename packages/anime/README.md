# @kineglyph/anime

The motion runtime for [Kineglyph](https://github.com/Nano112/kineglyph). A Kineglyph scene
already carries its own timeline; this package is what plays it, using
[Anime.js v4](https://animejs.com) scoped so that a figure's animations start, seek, and stop with
the figure rather than with the page.

```bash
npm install @kineglyph/anime
```

```ts
import { createAnimationProgram, KineglyphSceneAnimator } from "@kineglyph/anime";

const animator = new KineglyphSceneAnimator(rootSvgElement, resolvedScene);
animator.play();
animator.seek(0.5);   // halfway, deterministically — the same frame every time
animator.dispose();   // tears the Anime.js scope down with it
```

Most people never import this directly: [`@kineglyph/web`](../web) mounts figures and owns an
animator for each one. Reach for it when you are building your own mount — a canvas editor, a
slide deck, a test harness that needs to step a scene frame by frame.

## What is in here

- `KineglyphSceneAnimator` — binds a resolved scene to a live SVG subtree.
- `createAnimationProgram` — compiles a scene's timeline into an ordered list of cues without
  touching the DOM, which is what makes a frame assertable in a unit test.
- `cueStatesAt(program, t)` — the state of every cue at a point in the timeline.

Scoping matters more than it sounds. Anime.js keeps a global registry; a figure that unmounts
without disposing its scope leaves timers running against detached nodes. Every entry point here
returns something with a `dispose()`.

## Licence

MIT — see [LICENSE](./LICENSE).
