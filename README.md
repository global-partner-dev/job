# Workana Radar — Job Scraper + Bid Bot

Two parts around one **Supabase** (Postgres) database:

1. **Python scraper** (`/`) — runs on your VPS, scrapes IT/programming jobs from
   [Workana](https://www.workana.com), filters them, and stores only the relevant ones.
2. **Chrome extension** (`extension/`) — a Chrome side panel next to the Workana page. It takes projects from the database one by one, writes a proposal with OpenAI,
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
   `05_drop_ai_summary.sql`, **`06_bidded.sql`**, **`07_two_bidders.sql`** and
   **`08_second_bidder_filter.sql`**. Each file is idempotent.
   `06_bidded.sql` adds `jobs.bidded` (`0` = not bid on yet, `1` = bid sent) and the two
   functions the extension calls; `07_two_bidders.sql` adds `jobs.bidded_second` and makes
   those functions bidder-aware; `08_second_bidder_filter.sql` lets the second bidder mark a
   project it passes on (`bidded_second = 2`, reason in `second_skip_reason`). The extension's
   publishable key gets **no table access** — only `next_unbidded_job()`, `mark_job_bidded()`
   and `skip_job_second()`.
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
#     OPENAI_MODEL=gpt-6-luna

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

Click the toolbar icon: the panel opens in **Chrome's side panel** on the right, and Chrome
narrows the Workana page to fit beside it, so nothing is covered. Drag the panel's left edge to
make it as wide as you like — Chrome remembers the width. Click the icon again, or use the
side panel's own close button, to hide it. Needs Chrome 114 or newer.

**Fields in the panel**

| Field                     | What it is                                                     |
| ------------------------- | -------------------------------------------------------------- |
| Bidder                    | **First** (bids right away) or **Second** (waits N minutes, default 20) |
| OpenAI API key            | used to write each proposal (stored in this browser only)       |
| Supabase URL / publishable key | where the queue is read from                              |
| Prompt                    | the built-in system prompt, editable; **Reset to built-in** restores it |
| More settings             | model, portfolio link, random delays, auto-send on/off          |

**Two bidders.** Up to two people run the extension, each in their own browser and Workana
account. The **first bidder bids on every project** as soon as it is stored. The **second bidder
is selective**: once a project has been stored for the chosen number of minutes (counted from
when the scraper saved it, so it works even if the first bidder is offline), it reads the full
brief and only bids when the project passes its check. Each has their own flag: `bidded`
(first) and `bidded_second` (second). Use a different Workana account for each.

**The second bidder's check** (the budget plays no part in it). It passes on a project when:

- the brief was written by **Workana's assistant** rather than the client — briefs that open
  like "The client is looking for…", "O cliente busca…", "El cliente busca…" (judged by
  that opening only; a merely polished brief is fine);
- the client **requires something we must already have**: our own app already on Google Play,
  a ready-made product or code base to adapt, rent or resell ("no development from scratch",
  "send your APK first"), a registered company, presence on site. The proposal writer also
  answers `SKIP: <reason>` instead of a bid if it finds such a condition, so a proposal never
  admits to missing a requirement;
- the **scope is too vague** to estimate (e.g. "We need to migrate an existing system… PHP
  experience required": migrate what, how big, for whom?);
- it is **not one of its project types**: an MVP of a specific concept (PWA, mobile app, web
  app), an internal management system, a CRM/ERP, or business process automation (simple
  WhatsApp bots/auto-replies don't count).

A project it passes on gets `bidded_second = 2` and the reason in `second_skip_reason`, and the
log shows "Skipped: …". To give one back to the queue:
`update jobs set bidded_second = 0, second_skip_reason = null where id = '…';`
When the scraper only stored the listing preview, the second bidder reads the full brief from
the project page in its own (logged-in) browser; if that page can't be read, the project is
tried again 15 minutes later rather than judged on the preview.

**The second bidder's proposal format**: a bold greeting with the client's first name and 🖐
("𝗢𝗹𝗮́ 𝗕𝗿𝘂𝗻𝗼 🖐", or no name when Workana only shows initials), one paragraph on the business
logic the project depends on, "Este é meu enfoque." with numbered points ending in the stack,
an itemised fixed-price budget whose lines add up to the total, and when it can start plus the
total timeline. Its prices are pegged to the sample bid ($1,400 for an 8-part system in 5–6
weeks): about $300–700 for a small project, $700–1,400 for a typical system, never above
$2,000. The first bidder keeps its shorter plan-led message and never uses a name.

**What "Start bidding" does**, one project at a time:

1. Ask Supabase for the newest project this bidder hasn't bid on (and that is old enough for them).
2. If the database only has the listing preview, read the full brief from the project page.
   **Second bidder only:** run the check above and skip the project if it doesn't pass.
3. Write the proposal with OpenAI, in the language of the brief: a concrete plan for how the
   work would be done, a price in USD and a deadline (worked out from the scope, not from
   Workana's listed budget).
4. Open the project's Workana message page in a background tab, fill the form, press Send
   (or, with auto-send off, wait for your click).
5. Set this bidder's flag (`bidded`, or `bidded_second` for the second bidder) to `1`, then move on. When the queue is empty it checks again
   every 30 seconds until you press **Stop**.

A project that fails (OpenAI error, Send not found, tab closed) is **left unmarked** and
skipped for the rest of that run. A bad OpenAI key or a missing database function stops the
whole run instead of burning through the queue. Sent slugs are also remembered locally, so a
failed database update can never cause a second proposal to the same project.

The run lives in the background worker, so reloading the Workana page doesn't interrupt it.

**Follow-up message.** Fill in **Follow-up** in the panel — a number of hours and a message —
and every bid that goes out gets a second message into the same conversation that many hours
later (fractions work: `0.5` = 30 minutes). An empty message turns it off.

- It is stored in this browser, so each bidder follows up from their own Workana account.
- The message is captured when the bid is sent; editing the field afterwards only affects
  later bids. **Cancel pending** in the panel drops everything still waiting.
- A one-minute timer sends whatever is due, **even when bidding is stopped**, as long as
  Chrome is open. If Chrome was closed at the due time it goes out on the next start.
- If the message box can't be found it tries again 10 minutes later, up to 3 times, then
  gives up and logs it. It does not check whether the client has already replied.

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
    ├── background.js           # opens the side panel, runs the bid queue, ticks the follow-up timer
    ├── content/workana-question.js  # fills Workana's form, detects Send
    ├── panel/                  # side panel UI (bidder role, keys, prompt, follow-up, status, log)
    └── lib/
        ├── bid-queue.js        # fetch → write → send → mark bidded
        ├── followups.js        # queue + send the follow-up message after each bid
        ├── tab-send.js         # open the message page, fill it, detect Send (bids + follow-ups)
        ├── supabase-jobs.js    # queue RPC calls
        ├── default-prompt.js   # the built-in prompts (first + second bidder)
        ├── project-check.js    # the second bidder's check before it bids
        └── openai.js, storage.js, timing.js, workana.js, parse.js, cookies.js
```
