# Deploying IEI

Cloudflare at the edge, a Node origin behind it, and **no change to the application** to get there.

That last part is the reason for this shape. The product reads a 446 MB read-only SQLite file through
`node:sqlite`, synchronously, and loads its repo layer at request time as TypeScript source. A serverless
platform breaks all three of those. A single small Node box breaks none of them, and Cloudflare in front
supplies the cache, the TLS, the WAF and the bandwidth that were the reason to want a CDN in the first place.

```
reader → Cloudflare (DNS · CDN · WAF · cache) → Fly machine (Node 24, 2 GB) → /data/registry.db
```

## What the platform has to provide

Measured, because each of these ruled out an alternative:

| Requirement | Figure | What it rules out |
|---|---|---|
| Read a SQLite file from disk | 446 MB | Vercel and Workers function bundles (250 MB / 10 MB) |
| `node:sqlite`, synchronous | 151 call sites, 127 repo functions | Any network database, without an async port |
| Import `.ts` at request time | `place-page.ts` dynamic `file://` import | Cloudflare Workers — no filesystem, no runtime module loading |
| Node ≥ 23.6 | type stripping unflagged | Node 22 without `--experimental-strip-types` |

`Dockerfile` checks the last two at **build** time, so a wrong base image fails the build instead of failing
every place, district and constituency page on first request.

## First deploy

Nothing here touches `wbvotes.in`. That comes last, deliberately.

```sh
# 1 — the machine and its volume. fly.toml already pins bom, 2 GB and one machine.
fly launch --no-deploy --name iei
fly volumes create registry --region bom --size 3

# 2 — build and ship the image. No database yet, so every page will render its
#     "registry unavailable" state. That is the expected intermediate result.
fly deploy

# 3 — the registry. Built offline on a workstation, never in CI: ingest reads source
#     files that are not in the repo.
npm run registry:migrate && npm run registry:ingest   # produces .data/registry.db
fly ssh sftp shell -a iei
  put .data/registry.db /data/registry.db
  exit
fly machine restart -a iei

# 4 — read it back before telling anyone.
curl -s https://iei.fly.dev/state/ka | grep -c "Karnataka"
```

Step 3 uploads 446 MB over SFTP. If it is slow or fragile, `fly ssh console -a iei` and pull it from object
storage instead — the file is immutable between ingests, so any transport is fine.

## Cloudflare

Only after `iei.fly.dev` serves real pages.

1. Add the zone, point the registrar's nameservers at Cloudflare.
2. `CNAME wbvotes.in → iei.fly.dev`, **proxied** (orange cloud).
3. SSL/TLS mode **Full (strict)** — Fly terminates TLS and `force_https` is on.
4. Leave caching at defaults. The application already sends the right headers and Cloudflare honours them:
   `s-maxage=900` on `/v1/*`, `immutable` on `/_next/static/*`. Every page is server-rendered with zero client
   JavaScript, which is close to the ideal shape for an edge cache.
5. Set `NEXT_PUBLIC_SITE_URL=https://wbvotes.in` in `fly.toml` and redeploy.

Do not add a Cloudflare page rule that caches HTML by default. Election pages are `force-dynamic` and a
by-election result cached for a day is exactly the staleness this product is built to avoid.

## Updating the registry

The database is a build artefact, not a live store. Nothing writes to it in production.

```sh
npm run registry:ingest              # local
npm run mandate -- elections validate
npm run mandate -- geography validate
fly ssh sftp shell -a iei            # put .data/registry.db /data/registry.db.new
fly ssh console -a iei -C "mv /data/registry.db.new /data/registry.db"
fly machine restart -a iei
```

Upload beside the live file and move it into place, so a failed transfer cannot leave a truncated database
where a working one was. The volume is sized for both copies.

## Known state at first deploy

Honest, so nobody discovers these from a reader:

- **West Bengal 2026 turnout reads "verification pending."** Deliberate — the registry's 93.0% is a seed
  defect and the value is preserved in the evidence drawer with its reason. See `repo/turnout-trust.ts`.
- **Assam and Jammu & Kashmir have no 2024 parliamentary geometry.** Those views say so and list every result.
- **A Lok Sabha seat has no district**, and no assembly-segment list exists. The registry asserts no such
  relationship and none was invented.

## One machine, on purpose

A Fly volume attaches to exactly one machine. A second machine would boot with no database and serve the
unavailable state to whichever readers it happened to receive. Scaling this is a read-replica question, not a
`min_machines_running` question.
