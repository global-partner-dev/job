# Workana Radar — Job Scraper + Live Dashboard

A two-part system for monitoring freelance opportunities on [Workana](https://www.workana.com):

1. **Python scraper** (`/`) — runs on your VPS, scrapes IT/programming jobs, enriches
   them with client stats, English translation, and an OpenAI "AI analysis", and stores
   everything in **Supabase** (Postgres).
2. **React dashboard** (`web/`) — a live, "smart" monitoring UI deployed on **Vercel**
   that reads from Supabase in real time.

```
Workana ──► Python scraper (VPS) ──► Supabase (Postgres) ──► React dashboard (Vercel)
             Selenium + requests        service_role key         anon key (read-only, RLS)
             + translate + OpenAI        realtime enabled         live updates
```

> Telegram notifications were removed — the enrichment that used to feed Telegram
> (translation + AI summary) is now stored in Supabase and surfaced in the dashboard.

---

## 1. Supabase setup (do this first)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of
   [`web/supabase/schema.sql`](web/supabase/schema.sql), and run it. This creates the
   `jobs` + `scrape_history` tables, indexes, read-only RLS policies, and enables
   realtime on `jobs`.
3. From **Settings → API**, grab:
   - **Project URL** — used by both the scraper and the web app.
   - **`service_role` key** — for the **scraper only** (bypasses RLS; keep it secret).
   - **`anon` public key** — for the **web app** (read-only via RLS; safe to expose).

---

## 2. Scraper setup (VPS)

Requires Python 3.9+ and a headless Chromium.

```bash
# System Chromium (Ubuntu/Debian VPS)
sudo apt install -y chromium-browser chromium-chromedriver

# Python deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.template .env
#   edit .env →
#     SUPABASE_URL=...              (Project URL)
#     SUPABASE_SERVICE_KEY=...      (service_role key)
#     GOOGLE_TRANSLATE_API_KEY=...  (optional — translate jobs to English)
#     OPENAI_API_KEY=...            (optional — AI analysis summary)
#     OPENAI_MODEL=gpt-4o-mini

# Run
python main.py
```

Behavior is controlled in [`config/settings.py`](config/settings.py):

| Setting            | Default        | Meaning                                            |
| ------------------ | -------------- | -------------------------------------------------- |
| `DEFAULT_CATEGORY` | `it-programming` | Workana category to scrape                        |
| `DEFAULT_LANGUAGE` | `en,pt,es`     | Job languages                                       |
| `MAX_PAGES`        | `1`            | Pages per run (`None` = no limit)                   |
| `SCRAPE_INTERVAL`  | `30`           | Seconds between runs (`None` = run once and exit)   |

Only **new** jobs (never-before-seen IDs) are enriched with client stats, translation,
and AI analysis, so re-scraping stays cheap. Every run also records a row in
`scrape_history` (powering the dashboard's activity chart).

### Run it continuously on the VPS

```bash
# quick + dirty
nohup python main.py > scraper.log 2>&1 &

# or a systemd unit (recommended) — set WorkingDirectory + the .env, Restart=always
```

Translation and AI summarization are optional: without the keys the scraper still runs
and stores the original-language text.

---

## 3. Web dashboard (`web/`)

Vite + React + TypeScript + Tailwind + `@supabase/supabase-js`. Reads Supabase with the
**anon** key and subscribes to realtime `jobs` changes.

### Local development

```bash
cd web
npm install
cp .env.example .env
#   VITE_SUPABASE_URL=...        (Project URL)
#   VITE_SUPABASE_ANON_KEY=...   (anon public key)
npm run dev            # http://localhost:5173
npm run typecheck      # optional: strict TS check
```

### Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **New Project → import the repo** and set:
   - **Root Directory:** `web`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build` · **Output:** `dist` (defaults are fine)
3. Add **Environment Variables** (Project → Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. `web/vercel.json` already sets the SPA rewrite so client-side routes resolve.

> The scraper is **not** deployed to Vercel — it stays on your VPS. Vercel only hosts the
> static dashboard, which talks to Supabase directly from the browser.

### Dashboard features

- **Live feed** — new jobs appear instantly via Supabase realtime (with a "new" pulse).
- **Opportunity score (0–100)** — a heuristic lead-quality rank (payment verified, paying
  client, low competition, budget, freshness) with an explainable "why this score".
- **Filters & sort** — full-text search, budget type, country, verified-only, saved-only,
  minimum score; sort by newest / score / fewest bids / budget / rating.
- **Stats + activity chart** — totals, 24h new, hot leads, verified %, avg bids, and a
  scrape-history bar chart.
- **Saved jobs** (localStorage), light/dark theme.

---

## Project layout

```
.
├── main.py                     # scraper entrypoint (Supabase + enrichment)
├── requirements.txt
├── .env.template
├── config/                     # settings + CSS selectors
├── scrapers/workana_scraper.py # Selenium listing scraper
├── parsers/                    # job / date / client-stats parsing
├── storage/
│   └── supabase_store.py       # Supabase (Postgres) store
├── utils/
│   ├── enrichment.py           # translation + AI analysis → job fields
│   ├── translator.py           # Google Cloud Translation
│   └── openai_summarizer.py    # OpenAI "AI analysis" summary
└── web/                        # React dashboard (deploy to Vercel)
    ├── supabase/schema.sql     # run this in Supabase
    └── src/                    # components, hooks, lib
```
