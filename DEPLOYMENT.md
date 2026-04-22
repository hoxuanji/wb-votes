# WB Votes — Deployment Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT BROWSER                          │
│           (Next.js static + React hydration)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│                  VERCEL EDGE NETWORK                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Next.js App (App Router, SSR + RSC)          │   │
│  │                                                      │   │
│  │  Pages:                    API Routes:               │   │
│  │  /                         /api/constituencies       │   │
│  │  /constituency/[id]        /api/candidates           │   │
│  │  /candidate/[id]           /api/candidates/[id]      │   │
│  │  /compare                  /api/quiz/questions       │   │
│  │  /quiz                                               │   │
│  │  /results                                            │   │
│  └─────────────────────────┬────────────────────────────┘   │
└────────────────────────────│────────────────────────────────┘
                             │ PostgreSQL / Supabase client
┌────────────────────────────▼────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                     │
│  Tables: constituencies, parties, candidates,               │
│          quiz_questions, quiz_options,                      │
│          quiz_sessions, quiz_session_answers                │
│                                                             │
│  Row Level Security: public read-only for reference data    │
└─────────────────────────────────────────────────────────────┘

Data Pipeline:
  ECI Affidavits / MyNeta.info
       │
       ▼ scripts/scraper/myneta.ts
  JSON candidates_real.json
       │
       ▼ scripts/seed.js
  Supabase DB (production)
```

---

## Prerequisites

- Node.js 20+
- npm / pnpm
- Git
- Vercel account (free tier OK)
- Supabase account (free tier OK)

---

## 1. Local Development Setup

```bash
# Clone / enter project
cd wb-votes

# Install dependencies
npm install

# Copy env file
cp .env.local.example .env.local
# Edit .env.local with your values (see below)

# Run dev server
npm run dev
# → http://localhost:3000
```

### `.env.local` values for local dev (MVP with mock data)

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="WB Votes"

# For MVP with mock data, leave DB vars empty
# DATABASE_URL=
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 2. Supabase Setup (Production DB)

1. Go to https://supabase.com → New Project
2. Set a strong DB password (save it)
3. Go to **SQL Editor** → New Query
4. Paste the contents of `database/schema.sql` → Run
5. Copy your project credentials from **Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
   - Connection string → `DATABASE_URL`

---

## 3. Seed Mock Data to DB

```bash
# Install Supabase client
npm install @supabase/supabase-js

# Create scripts/seed.js with your mock data → Supabase inserts
node scripts/seed.js
```

Sample seed script structure:
```javascript
const { createClient } = require('@supabase/supabase-js');
const { constituencies } = require('./src/data/constituencies');
const { parties } = require('./src/data/parties');
const { candidates } = require('./src/data/candidates');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  await supabase.from('parties').upsert(parties);
  await supabase.from('constituencies').upsert(constituencies.map(c => ({
    id: c.id, assembly_number: c.assemblyNumber, name: c.name,
    name_bn: c.nameBn, district: c.district, district_bn: c.districtBn,
    reservation: c.reservation,
  })));
  // ... candidates similarly
}
seed();
```

---

## 4. Deploy to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Option B: GitHub Integration (Recommended)

1. Push code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial WB Votes MVP"
   git remote add origin https://github.com/YOUR_USERNAME/wb-votes.git
   git push -u origin main
   ```

2. Go to https://vercel.com → **Add New Project** → Import from GitHub

3. Set **Environment Variables** in Vercel dashboard:
   ```
   NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
   SUPABASE_SERVICE_ROLE_KEY=eyJyyy
   DATABASE_URL=postgresql://postgres:pwd@db.xxx.supabase.co:5432/postgres
   ```

4. Deploy → Vercel auto-detects Next.js, builds, and deploys.

### Custom Domain (Optional)

- Vercel dashboard → Project → Settings → Domains
- Add `wbvotes.in` or your domain
- Update DNS CNAME to `cname.vercel-dns.com`

---

## 5. CI/CD Pipeline

Vercel auto-deploys on every push to `main`.

For staging:
- Create a `develop` branch
- Vercel auto-creates preview deployments for PRs

Recommended GitHub Actions (`.github/workflows/ci.yml`):

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
```

---

## 6. Real Data Ingestion

### Step 1: Scrape MyNeta.info

```bash
# Run the scraper
npm run scrape -- --election=2021

# Output: src/data/candidates_real.json
```

### Step 2: Review & clean data

```bash
# Inspect output
cat src/data/candidates_real.json | python3 -m json.tool | less
```

### Step 3: Seed to production DB

```bash
DATABASE_URL=... node scripts/seed.js --source=./src/data/candidates_real.json
```

### Alternative: ECI Direct Data

- Download from: https://affidavit.eci.gov.in/
- Filter by State: West Bengal
- Download Excel → parse with xlsx npm package
- Map to your schema

---

## 7. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Full URL of your site |
| `NEXT_PUBLIC_SUPABASE_URL` | Prod only | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod only | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | For DB writes (never expose to client) |
| `DATABASE_URL` | Prod only | Direct PostgreSQL connection string |

---

## 8. Performance Checklist

- [x] Next.js App Router with RSC (server components by default)
- [x] Static generation for constituency and candidate pages
- [x] Image optimization via next/image
- [x] Tailwind CSS (purged in production)
- [x] Mobile-first responsive layout
- [ ] Add ISR (Incremental Static Regeneration) when DB is live:
  ```typescript
  export const revalidate = 3600; // re-generate every hour
  ```
- [ ] Add Vercel Edge Config for feature flags

---

## 9. Future Improvements

### Phase 2 (Real Data)
- [ ] Full 294 constituency dataset
- [ ] Real ECI affidavit scraper with rate limiting
- [ ] Automated nightly data refresh via Vercel cron

### Phase 3 (Features)
- [ ] Voter registration lookup (link to ECI voter portal)
- [ ] Constituency finder by address (Google Maps Geocoding API)
- [ ] Historical election results comparison
- [ ] Candidate social media links
- [ ] Mobile app (React Native / Expo)
- [ ] Notification alerts for filing deadlines

### Phase 4 (Scale)
- [ ] Redis caching for API responses
- [ ] CDN-level caching on Vercel Edge
- [ ] Full Bengali UI (i18n library like next-intl)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Analytics with privacy-first Plausible (no cookies)

---

## Legal & Ethical Notes

- This tool is purely informational. It does not endorse any candidate or party.
- All candidate data is self-declared in ECI affidavits (public record).
- Quiz scores are approximations — not verified policy positions.
- No personal data is collected. No cookies except functional.
- Comply with ECI Model Code of Conduct during election periods.
- Check ECI guidelines before deploying near election dates.
