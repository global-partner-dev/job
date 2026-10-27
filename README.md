# Workana Radar — Job Scraper + Bid Bot

Two parts around one **Supabase** (Postgres) database:

1. **Python scraper** (`/`) — runs on your VPS, scrapes IT/programming jobs from
   [Workana](https://www.workana.com), filters them, and stores only the relevant ones.
2. **Chrome extension** (`extension/`) — a side panel on the right third of the browser
   window. It takes projects from the database one by one, writes a proposal with OpenAI,
   sends it on Workana, and sets the project's `bidded` field to `1`.

```
Workana ──► Python scraper (VPS) ──► Supabase (Postgres) ◄── Chrome extension (side panel)
             Selenium + requests      jobs.bidded = 0|1       OpenAI proposal → Workana form
             filters + AI triage      secret key (scraper)    publishable key (extension)
```

> **No translation, no summarizing.** Project details are stored exactly as posted
> (PT / ES / EN). The scraper's only AI step is the optional **category filter** — a yes/no
> triage call. Set `AI_CATEGORY_FILTER=0` and the scraper makes zero OpenAI calls.

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query** and run the files in [`supabase/`](supabase/) **in order**:
   `schema.sql`, `02_auth_multiuser.sql`, `03_cleanup.sql`, `04_ask_questions.sql`,
   `05_drop_ai_summary.sql`, and **`06_bidded.sql`**. Each file is idempotent.
   `06_bidded.sql` adds `jobs.bidded` (`0` = not bid on yet, `1` = bid sent) and the two
   functions the extension calls. The extension's publishable key gets **no table access** —
   only `next_unbidded_job()` and `mark_job_bidded()`.
3. From **Settings → API Keys**, grab:
   - **Project URL** — scraper and extension.
   - **Secret key** (legacy: `service_role`) — **scraper only**, in `.env`. Bypasses RLS.
   - **Publishable key** (legacy: `anon`) — typed into the extension's panel.

> The old dashboard tables (`profiles`, `bids`, auth policies) are still in the database and
> harmless. Nothing reads them any more except `03_cleanup`/`06` keeping rows that have a bid.

---

## 2. Scraper setup (VPS)

Requires Python 3.9+, Chrome/Chromium, and **Xvfb**.

> **Why Xvfb?** Workana sits behind a Cloudflare managed challenge. A stock Selenium
> Chrome never clears it — not headless, not headful — which returns 403 on every job
> detail page (no client stats, and only the ~350-char listing preview instead of the full
> brief). `undetected-chromedriver` does clear it, but **only running headful**, since
> headless is exactly what the challenge detects. On a headless VPS that means a virtual
> display. Run the scraper with `xvfb-run -a`.

```bash
# System Chromium + virtual display (Ubuntu/Debian VPS)
sudo apt install -y chromium-browser chromium-chromedriver xvfb

# Python deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.template .env
#   edit .env →
#     SUPABASE_URL=...              (Project URL)
#     SUPABASE_SERVICE_KEY=...      (secret key)
#     OPENAI_API_KEY=...            (optional — AI category filter only)
#     OPENAI_MODEL=gpt-4o-mini

# Run (xvfb-run gives Chrome the display it needs)
xvfb-run -a python main.py
```

If you must run without a display, set `USE_UNDETECTED_DRIVER=0` — the scraper falls back
to the stock driver, still collects the listing, and tells you which detail pages it could
not reach. Jobs whose full brief is unavailable are **kept unjudged** rather than discarded
(see the AI category filter below).

Behavior is controlled in [`config/settings.py`](config/settings.py):

| Setting                  | Default          | Meaning                                           |
| ------------------------ | ---------------- | ------------------------------------------------- |
| `DEFAULT_CATEGORY`       | `it-programming` | Workana category to scrape                        |
| `DEFAULT_LANGUAGE`       | `en,pt,es`       | Job languages                                     |
| `MAX_PAGES`              | `1`              | Pages per run (`None` = no limit)                 |
| `SCRAPE_INTERVAL`        | `30`             | Seconds between runs (`None` = run once and exit) |
| `USE_UNDETECTED_DRIVER`  | `1`              | Cloudflare-capable driver; needs a display        |

Only **new** jobs (never-before-seen IDs) are enriched with client stats and run through
the category filter, so re-scraping stays cheap. Every run also records a row in
`scrape_history`.

### Run it continuously on the VPS

```bash
# quick + dirty
nohup python main.py > scraper.log 2>&1 &

# or a systemd unit (recommended) — set WorkingDirectory + the .env, Restart=always
```

The category filter is the only OpenAI call in the pipeline, and it resolves its two
"no verdict" cases in deliberately opposite directions:

- **Full brief unavailable** (detail page blocked, only the listing preview) — the job is
  **kept, unjudged, with no API call**. Classifying a project from a tenth of its text is a
  guess, not a filter, so nothing is discarded on data the model never saw. Those rows get
  `ai_category = 'unjudged_truncated'`.
- **Classifier unavailable or API error** — the input was fine but no verdict came back, so
  the job **fails closed**: skipped this run, re-evaluated on a later one. A dead API key
  therefore empties the archive rather than polluting it.

Set `AI_CATEGORY_FILTER=0` to drop the filter entirely and store everything that passes the
country / price / payment filters below.

### Archive filters

Every stored project must pass all of these — see [`parsers/filters.py`](parsers/filters.py):

| Filter          | Rule                                                             |
| --------------- | ---------------------------------------------------------------- |
| Country         | Americas + Spain & Portugal only; unknown country is excluded     |
| Price           | fixed-price under **$101** excluded (hourly / no-budget kept)     |
| Payment ability | clients with 2+ published projects and **0 paid** are excluded    |
| Template posts  | tagged with both **Chatbot** and **Natural Language Processing**, or WhatsApp bot/automation wording |
| AI category     | only the target project types (`AI_CATEGORY_FILTER=1`)            |

---

---

## 3. Chrome extension (`extension/`)

Load it once: **chrome://extensions → Developer mode → Load unpacked → `extension/`**.
Sign in to Workana in the same Chrome profile.

Click the toolbar icon on any Workana page: the panel opens on the **right third of the
window** and the page shrinks to fit beside it. Click again (or ×) to close it. On any other
site the icon opens Workana with the panel showing.

**Fields in the panel**

| Field                     | What it is                                                     |
| ------------------------- | -------------------------------------------------------------- |
| OpenAI API key            | used to write each proposal (stored in this browser only)       |
| Supabase URL / publishable key | where the queue is read from                              |
| Prompt                    | the built-in system prompt, editable; **Reset to built-in** restores it |
| More settings             | model, portfolio link, random delays, auto-send on/off          |

**What "Start bidding" does**, one project at a time:

1. Ask Supabase for the newest project with `bidded = 0`.
2. Write the proposal with OpenAI (no names, no price, one closing question).
3. Open the project's Workana message page in a background tab, fill the form, press Send
   (or, with auto-send off, wait for your click).
4. Set that project's `bidded = 1`, then move on. When the queue is empty it checks again
   every 30 seconds until you press **Stop**.

A project that fails (OpenAI error, Send not found, tab closed) is **left at `bidded = 0`** and
skipped for the rest of that run. A bad OpenAI key or a missing database function stops the
whole run instead of burning through the queue. Sent slugs are also remembered locally, so a
failed database update can never cause a second proposal to the same project.

The run lives in the background worker, so reloading the Workana page doesn't interrupt it.

---

## Project layout

```
.
├── main.py                     # scraper entrypoint
├── purge_nonpassing.py         # one-off: delete stored jobs that fail the current filters
├── config/                     # settings + CSS selectors
├── scrapers/workana_scraper.py # Selenium listing scraper
├── parsers/
│   └── filters.py              # country / price / payment / template filters
├── storage/supabase_store.py   # Supabase store
├── utils/                      # AI category filter
├── supabase/*.sql              # run in Supabase, in filename order
└── extension/                  # Chrome extension (load unpacked)
    ├── background.js           # panel lifecycle + runs the bid queue
    ├── content/panel.js        # draws the right-third side panel
    ├── content/workana-question.js  # fills Workana's form, detects Send
    ├── panel/                  # side panel UI (keys, prompt, status, log)
    └── lib/
        ├── bid-queue.js        # fetch → write → send → mark bidded
        ├── supabase-jobs.js    # queue RPC calls
        ├── default-prompt.js   # the built-in prompt
        └── openai.js, storage.js, workana.js, parse.js, cookies.js
```
