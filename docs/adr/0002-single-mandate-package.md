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

## Reconciling the root and registry tsconfigs — resolved

An earlier revision of this ADR claimed the two configs were "mutually exclusive on purpose and
cannot be reconciled by editing this package", and worked around it by adding `packages` to the
root `exclude`. **That claim was wrong.** Two compiler options in the root config reconcile them:

```jsonc
// tsconfig.json
"target": "ES2022",                    // was absent, so tsc defaulted to ES5
"allowImportingTsExtensions": true,    // legal here: moduleResolution is "bundler" + noEmit
```

Measured, with `include` and `paths` resolving from the repo root:

| root config | errors | where |
|---|---|---|
| no `target`, `packages` excluded | 0 | — |
| no `target`, `packages` included | **103** | all under `packages/` |
| `target: ES2022` + `allowImportingTsExtensions` | **0** | whole repo, `packages` included |

The 103 were 50× TS5097 on the `.ts` import specifiers and 53× TS2802/TS1501 from the ES5
default target. Both are properties of the *root* config, not of this package: the `.ts`
extensions are load-bearing for Node's native TypeScript execution, and ES5 was never a real
constraint for a Next 14 app whose bundle target comes from browserslist via SWC, not from
`target`.

So `packages` is no longer excluded, and the registry is type-checked twice, deliberately:

- `npm run type-check` — the whole repo under the app's options, catching anything that would
  break `next build`. Without this the seam is invisible: the Next app is about to import the
  repository layer, and an excluded directory is still pulled into the program by an import,
  so excluding it only delays the failure to build time.
- `npm run registry:typecheck` — this package's own project, which adds the strict flags the
  app does not have (`noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `verbatimModuleSyntax`).

## Correction: the old app had no pre-existing type errors

A related claim in the cycle-1 commits and in the `node:sqlite` shim comment — that the old app's
own typecheck "already carries 40 pre-existing errors" — was also wrong. The 40 came from
`npm run type-check` at a moment when `packages/` was in the program: every one of them was this
package's code compiled under the app's options. With `packages` excluded, `src/` reports **0**.

The shim in `packages/mandate/src/types/node-sqlite.d.ts` is still the right call, but for the
narrower reason only: `@types/node@20` predates `node:sqlite`, and bumping a dependency the whole
app shares to obtain types for one module in one package is the wrong trade. It is not because the
app's types were already broken. They were not.
