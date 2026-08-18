# Releasing Kineglyph to npm

Kineglyph publishes eight packages under one scope. Nothing is on the registry yet, so this is a
first release of `@kineglyph/*` — and a published version is immutable, so the order below is not
a suggestion.

Kineglyph goes first, before [pagina](https://github.com/Nano112/pagina), because pagina depends
on it. Nothing in pagina can name a real version range until these exist.

## Versions in this release

All eight publish at the version they already carry — no bumps. `.github/kineglyph-ref` in the
pagina repository pins this repository by commit SHA, and bumping versions here for their own sake
would only make the two harder to reason about.

| Package             | Version |
| ------------------- | ------- |
| `@kineglyph/core`   | 0.1.0   |
| `@kineglyph/svg`    | 0.1.0   |
| `@kineglyph/anime`  | 0.1.0   |
| `@kineglyph/plot`   | 0.1.0   |
| `@kineglyph/scenes` | 0.1.0   |
| `@kineglyph/web`    | 0.1.0   |
| `@kineglyph/export` | 0.2.0   |
| `@kineglyph/react`  | 0.1.0   |

Intra-repo dependencies are caret ranges against those numbers rather than `"*"`. One range works
in both worlds: npm's workspace resolution satisfies it from the checkout today, and the registry
satisfies it from a real tarball after this release.

## The checklist

1. **Land everything first.** `git status` clean, on `main`, pushed. A publish from a dirty tree
   ships files that are in no commit, and no one can tell afterwards.

2. **`npm login`.** Then confirm the scope is yours to publish into:

   ```bash
   npm whoami
   npm access list packages @kineglyph 2>/dev/null || echo "scope is empty — first publish"
   ```

3. **Dry run the whole thing.**

   ```bash
   npm run release:check
   ```

   That cleans, reinstalls from the lockfile, runs the full `npm run check` gate, then packs every
   package and audits the tarballs: a missing README or LICENSE, a shipped test file, a `"*"`
   dependency range, or an `exports` entry that is not actually in the tarball each fail the run.
   Tarballs land in `.release/`.

4. **Read the table it prints.** Two entries are large on purpose and worth a glance before they
   become permanent:

   - `@kineglyph/web` carries the pre-built `kineglyph-web.js` browser bundle and the lab editor
     chunk. **Before releasing, make sure `dist/` was built clean** — Vite writes content-hashed
     filenames, so a `dist/` that has accumulated builds ships every stale `lab-editor-*.js` and
     its source map. `npm run release:check` runs `npm run clean` first for exactly this reason;
     if you pack by hand, clean by hand.
   - `@kineglyph/core` ships `src/` alongside `dist/` so that the `development` export condition
     resolves to TypeScript source in a dev server. Its tests are excluded from the tarball.

5. **Publish.**

   ```bash
   npm run release:publish
   ```

   It re-runs the check, refuses to start if `npm whoami` fails, and then publishes in dependency
   order — `core → svg → anime → plot → scenes → web → export → react` — each with
   `--access public`, because a scoped package defaults to restricted and a restricted publish on
   a free account fails half-way through the chain.

   To see the commands without touching the registry: `RELEASE_DRY_RUN=1 npm run release:publish`.

6. **Tag it.**

   ```bash
   git tag -a npm-2026-08-18 -m "first npm release of @kineglyph/*"
   git push origin --tags
   ```

7. **Tell pagina.** In the pagina repository, run `npm run adopt:kineglyph`. That flips
   `@kineglyph/*` from optional peers to real dependencies, adds them at the workspace root, and
   reinstalls — after which pagina installs from the registry like anything else and
   `npm run link:kineglyph` is a development convenience rather than the only way in.

## Provenance

Worth it, but not on the first release. `npm publish --provenance` requires the publish to happen
inside a GitHub Actions workflow with `id-token: write`, and it signs a link between the tarball
and the commit that produced it — genuinely useful for a package other people install.

This repository has no workflows at all today, so wiring one is a separate piece of work from
getting a first version onto the registry, and doing both at once means debugging OIDC while also
finding out whether the tarballs are right. Publish by hand now; add a `release.yml` that runs
`npm run release:publish -- --provenance` on a tag afterwards, once the shape of the tarballs is
known-good.

## If something goes wrong mid-chain

Packages published before the failure stay published — versions are immutable and `npm unpublish`
is only available for 72 hours. Fix the problem, bump the _patch_ version of the packages that did
not make it, and run `npm run release:publish` again; it skips nothing, so bump anything already
on the registry or it will fail on the duplicate.
