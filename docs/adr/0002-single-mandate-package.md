# ADR 0002 — One `packages/mandate` package, not three

**Status:** accepted · 2026-08-07 · supersedes nothing

## Context

[§18](../mandate/04-engineering.md) specifies `packages/{core,semantic,ui,viz,map,ai,live,ingest,sdk}`
as separate workspace packages, with lint-enforced import boundaries between them.

Cycle 1 needs three of those: `core`, a db layer, and `ingest`. Setting them up as real
workspace packages costs a `pnpm-workspace.yaml` and `pnpm install` — and the repo root is an
existing npm-installed Next 14 app with a `package-lock.json`. Introducing pnpm alongside it
means two lockfiles, two `node_modules` resolution strategies, and a class of "works for me"
failures that buys nothing this cycle.

## Decision

One package: `packages/mandate/`, with `src/core/`, `src/db/`, `src/ingest/` as directories.
Cross-directory imports are relative. No workspace file, no install step, no lockfile change.

Node 25 runs TypeScript directly, so there is also no build step: `node bin/mandate.ts` and
`node --test 'src/**/*.test.ts'` work against the sources.

## Split trigger

Split into real packages when — and only when — **a second application needs to import a
subset.** Concretely: when `apps/reader` exists and must depend on `core` without pulling in
`ingest` (roadmap v1, [§28](../mandate/06-roadmap.md)).

The split is mechanical at that point: each `src/<dir>` becomes `packages/<dir>` with a
`package.json`, and relative imports become package-name imports. Keeping the directory names
identical to §18's package names now is what makes it mechanical later — do not rename them.

## Consequences

- **Lost:** lint-enforced import boundaries between core / db / ingest. Mitigated by directory
  discipline and by the fact that the dependency direction is one-way and shallow
  (`ingest → db → core`), which a reviewer can check by eye at this size.
- **Kept:** the boundary that actually matters today — nothing in `packages/mandate` imports from
  `src/` (the old Next app), and the old app does not yet import from `packages/mandate`. That is
  the strangler-fig seam from [§29](../mandate/06-roadmap.md) Phase A, and it is checkable with
  one grep.
- **Reversal condition:** if the one-way dependency direction is violated twice, split early —
  the boundary is evidently not holding on discipline alone.

## Known conflict with the root tsconfig — one line, outside this package

`packages/` is not in the root `tsconfig.json`'s `exclude`, and its `include` is `**/*.ts`. So
`next build`'s type-check stage compiles all of `packages/mandate` with the Next app's compiler
options, which have no `allowImportingTsExtensions` and no `target`. That is 104 errors
(`npx tsc --noEmit -p tsconfig.json`): 50× TS5097 on the `.ts` import specifiers, 39× TS2802 and
15× TS1501 from the ES5 default target. All 104 are under `packages/`; `src/` is clean under that
config.

The two configs are mutually exclusive on purpose and cannot be reconciled by editing this
package: the `.ts` extensions are load-bearing for Node's native TypeScript execution (`node
bin/mandate.ts` resolves the real filename), which is the whole point of the no-build-step
decision above. `registry:typecheck` cannot see the breakage because it only reads
`packages/mandate/tsconfig.json`.

The fix is one word in the root config, which is outside this package's ownership:

```jsonc
// tsconfig.json
"exclude": ["node_modules", "scripts", "workers", "packages"]
```

`packages/mandate` is type-checked by its own project (`npm run registry:typecheck`), so excluding
it from the app's project loses no coverage. Until that line lands, `npm run build` fails.
