# @mandate — registry, provenance, ingest

The data foundation for MANDATE (see `docs/mandate/`). Runs on Node 25 built-ins only:
`node:sqlite` for the registry, `node --test` for tests, native TS execution. **No dependencies.**

```
src/core/       entity types, IDs, temporal helpers, Indic normalisation  (§12)
src/db/         migration runner + query helpers                          (§19)
src/ingest/     static-module ingest with provenance, entity resolution   (§29 Phase B)
bin/mandate.ts  CLI: migrate · ingest · resolve · audit · query
```

<!-- ponytail: one package, not three. §18 specifies packages/{core,db,ingest} as separate
     workspace packages; that split buys nothing until apps/terminal and apps/reader import
     them independently (cycle 3+). Splitting is a mechanical move — see docs/adr/0002. -->

## Dev database

SQLite at `.data/registry.db`, gitignored. The DDL in `ops/migrations/` is written in a
portable subset so the same files run on Postgres in production — see `docs/adr/0001`.
