# Workana Radar — Job Scraper + Live Dashboard + AskBot

A three-part system for monitoring freelance opportunities on [Workana](https://www.workana.com):

1. **Python scraper** (`/`) — runs on your VPS, scrapes IT/programming jobs, enriches
   them with client stats, and stores everything in **Supabase** (Postgres).
2. **React dashboard** (`web/`) — a live monitoring UI deployed on **Vercel** that reads
   from Supabase in real time, with dropdown filters and the auto-ask toggle.
3. **AskBot extension** (`extension/`) — a Chrome extension that writes a short
   clarifying question for each new project and opens Workana's **"Ask a question"**
   form pre-filled. **You** press Send; nothing is ever submitted automatically.

```
Workana ──► Python scraper (VPS) ──► Supabase (Postgres) ──► React dashboard (Vercel)
             Selenium + requests        service_role key         anon key (RLS)
             + AI category filter        realtime enabled         live updates
                                                                       │ auto-ask toggle
                                                                       ▼
                                                          AskBot extension (Chrome)
                                                          writes question → opens
                                                          Workana pre-filled → you Send
```

> **No translation, no summarizing.** Project details are stored exactly as posted
> (PT / ES / EN). The scraper's only AI step is the **category filter** — a yes/no triage
> call that decides whether a project is worth keeping. Set `AI_CATEGORY_FILTER=0` and the
> scraper makes zero OpenAI calls.
>
> **No place-bid.** The old automated bidding flow was removed; AskBot only ever pre-fills
> Workana's question form.

---

## 1. Supabase setup (do this first)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query** and run these files **in order**:
   1. [`web/supabase/schema.sql`](web/supabase/schema.sql) — `jobs` + `scrape_history`,
      indexes, RLS, realtime on `jobs`.
   2. [`web/supabase/02_auth_multiuser.sql`](web/supabase/02_auth_multiuser.sql) —
      profiles, approval, and the per-user `bids` table.
   3. [`web/supabase/03_cleanup.sql`](web/supabase/03_cleanup.sql) — daily pg_cron sweep.
   4. [`web/supabase/04_ask_questions.sql`](web/supabase/04_ask_questions.sql) —
      migrates the `bids` table from the old place-bid flow to the ask-a-question flow.
   5. [`web/supabase/05_drop_ai_summary.sql`](web/supabase/05_drop_ai_summary.sql) —
      retires the `ai_summary` column.
      Each file is idempotent, so re-running is safe.
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
#     OPENAI_API_KEY=...            (optional — AI category filter only)
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

Only **new** jobs (never-before-seen IDs) are enriched with client stats and run through
the category filter, so re-scraping stays cheap. Every run also records a row in
`scrape_history` (powering the dashboard's activity chart).

### Run it continuously on the VPS

```bash
# quick + dirty
nohup python main.py > scraper.log 2>&1 &

# or a systemd unit (recommended) — set WorkingDirectory + the .env, Restart=always
```

The category filter is the only OpenAI call in the pipeline. It **fails closed** — a job
with no verdict is not stored — so a dead API key silently empties the archive. Set
`AI_CATEGORY_FILTER=0` to drop the filter and store everything that passes the country /
price / payment filters below.

### Archive filters (unchanged)

Every stored project must pass all of these — see [`parsers/filters.py`](parsers/filters.py):

| Filter          | Rule                                                             |
| --------------- | ---------------------------------------------------------------- |
| Country         | Americas + Spain & Portugal only; unknown country is excluded     |
| Price           | fixed-price under **$101** excluded (hourly / no-budget kept)     |
| Payment ability | clients with 2+ published projects and **0 paid** are excluded    |
| AI category     | only the target project types (`AI_CATEGORY_FILTER=1`)            |

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
- **Dropdown filters** — country, budget **range**, question status, and sort order, all
  picked from lists. Budget offers preset bands ($101–250, $250–500, $500–1,000, …) plus a
  **Custom range** with your own min/max; leave a side empty for no bound. Matching is
  interval *overlap*, so a $500–1,000 project appears under both "$250–500" and
  "$500–1,000". These narrow what *you* see; the archive filters above still decide what
  gets stored at all.
- **Auto-ask toggle** — one switch. See below.
- **Stats + country breakdown**, **saved jobs** (localStorage), light/dark theme.

---

## 4. AskBot extension (`extension/`)

Load it once: **chrome://extensions → Developer mode → Load unpacked → `extension/`**.
Sign in to Workana in the same Chrome profile. If you deploy the dashboard somewhere other
than the default, update `PROD_ORIGIN` in `extension/content/bridge.js` **and** the
matching entry in `extension/manifest.json`.

Then open the dashboard, press the gear on the bottom bar, and set your **OpenAI API key**
(stored in your browser only).

### How the toggle works

Flip **Auto-ask** on and the dashboard starts a queue at that moment:

1. The queue is every project **published after the toggle went on** that you have not sent
   a question about — newest first. Nothing older is ever touched.
2. The dashboard hands the newest one to the extension, which writes a short clarifying
   question (2–5 sentences, no price, exactly one question) with OpenAI.
3. The extension opens the project on Workana's **"Ask a question"** tab with the text
   already filled in, and stops there.
4. You read it and press **Send**. The extension notices the real submit, marks the project
   `sent`, and it **drops off the list**. Closing the tab instead skips to the next project.

Flip it off and the feed goes back to showing the whole archive.

| Setting              | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| Queue budget range   | min/max on top of the archive's $101 floor; empty side = no bound |
| Before opening       | random pause after the question is written, before the tab opens |
| Between projects     | random pause between one project and the next                    |
| Wait to press Send   | how long the queue waits for you before moving on                |
| Question prompt      | the system prompt used to write the question                     |

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
│   ├── enrichment.py           # AI category filter → job fields
│   └── openai_classifier.py    # OpenAI target-type triage (the only AI call)
├── extension/                  # AskBot Chrome extension (load unpacked)
│   ├── background.js           # MV3 worker — runs the ask queue
│   ├── content/bridge.js       # dashboard ↔ extension bridge
│   ├── content/workana-question.js  # fills Workana's question form, detects Send
│   └── lib/ask-queue.js        # write question → open pre-filled → wait for Send
└── web/                        # React dashboard (deploy to Vercel)
    ├── supabase/*.sql          # run in Supabase, in filename order
    └── src/                    # components, hooks, lib
```
