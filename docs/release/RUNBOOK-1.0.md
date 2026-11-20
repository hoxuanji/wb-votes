# Release runbook — 1.0.0

How to cut and deploy a release of India Election Intelligence, in order, with a check after every step and a way back from every step.
[DEPLOYMENT.md](../../DEPLOYMENT.md) is the reference for *why* the hosting is shaped this way and for the long forms of each procedure;
this file is the sequence you follow on the day. Where the two overlap, DEPLOYMENT.md has the detail and this file has the order.

Nothing in this runbook was run against the live deployment when it was written: the commands are the repository's own (`package.json`,
`fly.toml`, `Dockerfile`, `.github/workflows/ci.yml`) and the order is the one DEPLOYMENT.md argues for. The first release is the first test of it;
correct this file in the same commit as anything you find wrong.

## What a release is here

Two artefacts that ship **separately and must agree**:

| Artefact | Where it lives | How it ships |
| --- | --- | --- |
| The application (Next.js, `packages/mandate`) | the `india-election-intelligence` Fly app, one machine, region `sin` | `fly deploy` from a tagged commit |
| The registry (`registry.db`, a SQLite file, ~446 MB) | the Fly volume `registry`, mounted at `/data` | built offline, uploaded, moved into place |

CI (`.github/workflows/ci.yml`) **deploys nothing**. A merge to `main` changes no running site.

## Roles and what only the owner can do

- **Owner** — merges the pull requests, tags, runs every `fly` and `wrangler` command (they need the Fly and Cloudflare logins), and decides go/no-go.
- **Anyone** — can run the preflight and the smoke checks, which need no credentials.

## 0. Before the day

- [ ] Every change intended for 1.0 is merged to `main` through a pull request, and CI is green on it. (`git log main..<branch>` is empty for every branch you meant to ship.)
- [ ] One Node version everywhere (see *Node* below).
- [ ] The production registry has been migrated to the current schema on a **copy** (section 2), and that copy has passed its checks.
- [ ] You know which registry file you are shipping and have its SHA-256 written down.

### Node

CI runs Node 22, the Dockerfile runs `node:24-slim`, and DEPLOYMENT.md says `>= 23.6`. They must agree: the Dockerfile's build-time check imports the
repository's `.ts` layer, which needs unflagged type stripping. Pin **Node 24** in all of them and in `package.json` `engines`
(`"node": ">=24"`), and add `.nvmrc` containing `24`.

## 1. Preflight (any machine, no credentials)

Run from a clean checkout of the commit you will tag.

```bash
git status --porcelain                  # empty
npm ci
npm run type-check
npm run registry:typecheck
npm run lint
MANDATE_DIST=.next-verify npx next build
npm test                                # see below
```

`npm test` fails 51 tests on the seed registry **by design** (they need the full registry). The release gate is the *names*, not the count:
the failing set must equal `.github/test-baseline.txt`. CI does this comparison; to do it by hand, extract the `✖` lines from the run and diff them
against that file. Any name not in the baseline blocks the release.

On the machine that holds the **full** registry, also run the checks that need it:

```bash
npm run mandate -- elections validate
npm run mandate -- geography validate
npm run mandate -- geography check
npm run mandate -- export               # the seed round-trip ratchet; the floor only moves up
```

**Stop if:** any new failing test name, a build error, or any `validate` check that fails.

## 2. The registry (the step that can hurt)

The pages join the `current_result` view (migration 018). **A registry without it makes the seat, person, election and state pages answer 500.**
Migration 019 re-keys every stored claim **in place** and has **no down migration**. So the production file is never migrated in place.

1. Get the production file locally: `fly ssh sftp shell -a india-election-intelligence`, then at the `»` prompt `get /data/registry.db /tmp/prod-registry.db`
   (interactive — type each command on its own line and wait for it to finish). Check its size against the volume.
2. Keep the original: `cp /tmp/prod-registry.db /tmp/prod-registry.db.pre-019`.
3. Migrate the **copy**: `MANDATE_DB_PATH=/tmp/prod-registry.db npm run registry:migrate`.
   It applies every pending migration in order (018 then 019) and each in one transaction; an aborted one rolls back whole.
4. Check the copy:
   ```bash
   sqlite3 /tmp/prod-registry.db "SELECT count(*) FROM current_result"   # must equal the next line until a correction has been ingested
   sqlite3 /tmp/prod-registry.db "SELECT count(*) FROM result"
   MANDATE_DB_PATH=/tmp/prod-registry.db npm run mandate -- elections validate
   MANDATE_DB_PATH=/tmp/prod-registry.db npm run mandate -- geography validate
   ```
5. **Or rebuild from scratch** (authoritative; `node ops/rebuild.mjs .data/next.db`, ~12 minutes, then `node ops/rebuild-compare.mjs` must print `REPRODUCIBLE`).
   Prefer this when you have the cached sources; 019's own header says a migration only keeps a registry that cannot be rebuilt consistent.

**Never `registry:ingest` over a working registry** — it is not idempotent and produced 36 seats with two winners.

**Stop if:** the two counts differ, a validate fails, or the migration aborts. The original is untouched; nothing has shipped.

## 3. Cut the release (owner)

```bash
# on main, after the last merge, with CI green
git pull --ff-only
npm version 1.0.0 --no-git-tag-version   # edits package.json / package-lock.json only
# move the [Unreleased] heading in CHANGELOG.md to [1.0.0] and date it
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release 1.0.0"
git tag -a v1.0.0 -m "1.0.0"
git push origin main v1.0.0
```

The repository has no tags before this one; `v1.0.0` is the first.

## 4. Ship the registry first, then the code

Order matters: **new code on an old registry 500s; old code on a new registry works** (no page reads a claim's key, and 018 only adds a view).

### 4a. Registry — upload beside the live file, then move it

```bash
gzip -c /tmp/prod-registry.db > /tmp/registry.db.gz && shasum -a 256 /tmp/registry.db.gz
fly ssh sftp shell -a india-election-intelligence
#   » put /tmp/registry.db.gz /data/registry.db.gz.new      <- interactive: one command per prompt, wait for the byte count
#   » exit
fly ssh console -a india-election-intelligence -C "sha256sum /data/registry.db.gz.new"        # must equal the local hash
fly ssh console -a india-election-intelligence -C "cp /data/registry.db /data/registry.db.pre-1.0"   # the way back (needs ~450 MB free)
fly ssh console -a india-election-intelligence -C "gunzip -c /data/registry.db.gz.new > /data/registry.db.new"
fly ssh console -a india-election-intelligence -C "mv /data/registry.db.new /data/registry.db"
fly machine restart -a india-election-intelligence
```

The volume is 3 GB: live file + `.pre-1.0` + `.gz.new` + the unpacked `.new` is about 1.5 GB at peak. Delete `registry.db.gz.new` afterwards.

### 4b. Code

```bash
git checkout v1.0.0
fly deploy -a india-election-intelligence
```

There is **one machine** and a volume attaches to exactly one, so this is a restart, not a rolling deploy: expect a short gap while the new machine passes
the `GET /` health check (30 s interval). Do not add a second machine (it would boot with no database).

## 5. Verify (anyone)

```bash
B=https://india-election-intelligence.fly.dev     # or the production host once Cloudflare is in front
curl -s -o /dev/null -w "%{http_code} /\n"                "$B/"
curl -s -o /dev/null -w "%{http_code} /state/wb\n"        "$B/state/wb"
curl -s -o /dev/null -w "%{http_code} /search\n"          "$B/search?q=kolkata"
curl -s -o /dev/null -w "%{http_code} /icon.svg\n"        "$B/icon.svg"
curl -s "$B/review/merges" | grep -o "<button[^>]*>" | grep -vc iei-theme   # must print 0: the only button on that page is the theme toggle
curl -s -o /dev/null -w "%{http_code} /v1/live (404 until a live feed is configured)\n" "$B/v1/live"
```

Then open it in a browser and check, in this order:

1. The front page renders with the answer title, one scope sentence, and the map card on the first screen; the 'sources' drawer opens and closes (and Escape closes it).
2. A state page (`/state/wb`), a seat page, a person page, `/candidates`, `/search?q=kolkata`, `/coverage`: no 500, figures carry their source drawer, and `BJP`'s won-count on `/candidates` equals the election page's.
3. **Both themes**: set the OS to light, reload; to dark, reload; then use the theme button in the top bar to cycle System, Light, Dark. No page flashes the wrong theme on load, and the choice survives a reload.
4. A phone-width window (or a real phone): nothing scrolls sideways; the bottom tab bar (Overview, People, Data) does not cover the end of a page; search and the theme button are reachable.
5. Keyboard only: Tab reaches the skip link, then the search, then the theme button, each with a visible focus ring (this was NOT seen in a browser before 1.0: check it now).
6. Navigate between two pages: the top bar and rail should stay put while the content cross-fades (Chromium and recent Safari; other browsers navigate normally).

**Stop and roll back if:** any of those pages answers 500, the home page shows "registry unavailable", or counts on the front page are wrong (it should say West Bengal is the one state loaded).

## 6. Rollback

| What broke | Do |
| --- | --- |
| New code, pages 500 | `fly releases -a india-election-intelligence`, then `fly deploy -a india-election-intelligence --image <the previous release's image>`. The registry can stay: old code reads the new one. |
| New registry is wrong | `fly ssh console -a india-election-intelligence -C "cp /data/registry.db.pre-1.0 /data/registry.db"`, then `fly machine restart`. **Roll the code back too** if the file you restored predates 018 (new code 500s on it). |
| The migration aborted | Nothing shipped. The original is untouched. |
| Cloudflare misbehaving | Set the record to DNS-only (grey cloud); the Fly host serves directly. |

Keep `registry.db.pre-1.0` on the volume until the release has held for a week.

## 7. After the release

- Tag exists and is pushed; the GitHub release notes are the 1.0.0 section of `CHANGELOG.md`.
- Delete merged branches (local and remote); the stale worktree under `.claude/worktrees/`.
- Record what you actually did differently from this file, in this file.

## Not in 1.0 — say so in the release notes

- **One of 36 states is loaded** (West Bengal; 294 of 4,123 assembly seats, 42 of 543 Lok Sabha seats). Loading more is a Lokdhaba import job and the biggest product gap.
- No live results feed: `MANDATE_LIVE_PATH` has no producer in this repository, so `/v1/live` answers 404 and the front page shows no live board.
- English only. No paid tier. No accounts: the merge-review route writes only where `MANDATE_REVIEW_WRITES=1`, which production never sets.
- No continuous deployment, no uptime monitor beyond Fly's health check, and no scheduled data refresh: imports are run by hand on a workstation.
- Browser coverage: the interface was checked in a WebKit browser and headless Chromium only. Safari proper, Firefox, real phones and a screen reader have not been tried; keyboard focus rings and reduced-motion behaviour are held by tests, not seen.
- No cookies and no analytics. The one thing stored in the browser is the reader's theme choice (`localStorage`, key `iei-theme`).
