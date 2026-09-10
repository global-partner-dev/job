import sys
import time
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import (
    DEFAULT_CATEGORY, DEFAULT_LANGUAGE, MAX_PAGES,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    OPENAI_API_KEY, OPENAI_MODEL,
    SCRAPE_INTERVAL,
)
from storage.supabase_store import SupabaseJobStore
from scrapers.workana_scraper import WorkanaScraper
from parsers.client_stats import (
    enrich_job_with_client_stats,
    set_browser_fetcher,
    sync_cookies_from_browser,
)
from parsers.filters import passes_listing_filters, passes_client_filters
from utils.enrichment import UNJUDGED, job_matches_target_category
from utils.openai_classifier import OpenAIClassifier
from config.settings import AI_CATEGORY_FILTER


def run_scrape(db, scraper, classifier):
    start_time = time.time()
    scrape_failed = False

    # Existing job identifiers (also refreshes the store's internal id cache)
    existing_job_ids = db.get_existing_job_ids()

    try:
        print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting scrape...")
        print(f"Category: {DEFAULT_CATEGORY} | Language: {DEFAULT_LANGUAGE} | Max pages: {MAX_PAGES or 'No limit'}")
        print("-" * 60)

        scraped_jobs = scraper.scrape(
            category=DEFAULT_CATEGORY,
            language=DEFAULT_LANGUAGE,
            existing_job_ids=existing_job_ids,
            max_pages=MAX_PAGES,
        )

        if scraper.last_load_failed:
            scrape_failed = True
            print("⚠️  Page load failed — browser will restart before next run")

        print(f"Scraped {len(scraped_jobs)} jobs total")

        # Stage 1 — cheap listing filters (country + price), no fetch needed.
        stage1 = []
        skipped_listing = 0
        for job in scraped_jobs:
            if not job.get('id'):
                continue
            ok, reason = passes_listing_filters(job)
            if ok:
                stage1.append(job)
            else:
                skipped_listing += 1
        print(f"Passed country/price: {len(stage1)} | filtered out: {skipped_listing}")

        new_candidates = [j for j in stage1 if db.job_is_new(j['id'])]
        existing_jobs = [j for j in stage1 if not db.job_is_new(j['id'])]
        print(f"New candidates: {len(new_candidates)} | existing to refresh: {len(existing_jobs)}")

        # Enrich new candidates with client stats + full description (detail page).
        if new_candidates:
            # The browser just cleared Workana's WAF for the listing page — lend
            # those cookies to the plain-HTTP session so detail fetches aren't 403'd.
            adopted = sync_cookies_from_browser(scraper.get_cookies())
            print(f"Fetching client project stats from job pages... ({adopted} cookies from browser)")
            for i, job in enumerate(new_candidates, 1):
                if not job.get('url'):
                    continue
                enrich_job_with_client_stats(job, delay=i < len(new_candidates))

            missing_stats = sum(
                1 for j in new_candidates if j.get('client_published_projects') is None
            )
            if missing_stats:
                print(
                    f"⚠️  {missing_stats}/{len(new_candidates)} job pages returned no client stats — "
                    "the payment-ability filter cannot judge those and keeps them."
                )

        # Stage 2 — client payment-ability filter (needs the enriched stats).
        new_to_store = []
        skipped_nonpayer = 0
        for job in new_candidates:
            ok, reason = passes_client_filters(job)
            if ok:
                new_to_store.append(job)
            else:
                skipped_nonpayer += 1
        print(f"Passed client filter: {len(new_to_store)} | non-payers skipped: {skipped_nonpayer}")

        # Stage 3 — AI category filter: keep only the target project types
        # (SaaS, corporate/service sites excl. WordPress, custom CRM/ERP,
        # Python apps / API integrations, Shopify). Needs the full description.
        if AI_CATEGORY_FILTER:
            if classifier and classifier.is_available():
                matched = []
                skipped_offtarget = 0
                kept_unjudged = 0
                for job in new_to_store:
                    if job_matches_target_category(job, classifier=classifier):
                        matched.append(job)
                        if job.get("ai_category") == UNJUDGED:
                            kept_unjudged += 1
                    else:
                        skipped_offtarget += 1
                new_to_store = matched
                print(
                    f"Passed AI category filter: {len(new_to_store)} | "
                    f"off-target skipped: {skipped_offtarget}"
                )
                if kept_unjudged:
                    print(
                        f"   ({kept_unjudged} kept unjudged — only the listing preview was "
                        "available, so no AI verdict was taken)"
                    )
                if classifier.hard_failure and skipped_offtarget:
                    print(
                        f"⚠️  Those {skipped_offtarget} were NOT judged off-target — "
                        f"{classifier.hard_failure}. The filter fails closed, so nothing "
                        "can be stored until this is fixed."
                    )
            else:
                print("⚠️  AI category filter enabled but classifier unavailable — skipping filter")

        # Save: insert new (filtered) + refresh existing (volatile fields only).
        new_jobs = 0
        updated_jobs = 0
        for job in new_to_store:
            db.save_job(job)
            new_jobs += 1
        for job in existing_jobs:
            db.save_job(job)
            updated_jobs += 1

        print(f"Saved to Supabase — New: {new_jobs} | Updated: {updated_jobs}")

        duration = time.time() - start_time
        stats = db.get_statistics()
        print(
            f"Total jobs in DB: {stats['total_jobs']} | "
            f"New (24h): {stats['new_jobs_24h']} | Duration: {duration:.1f}s"
        )

        return not scrape_failed

    except Exception as e:
        print(f"❌ Error during scraping: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("=" * 60)
    print("Workana Job Scraper → Supabase")
    print("=" * 60)

    if SCRAPE_INTERVAL:
        print(f"🔄 Running in continuous mode (every {SCRAPE_INTERVAL} seconds)")
        print("   Press Ctrl+C to stop")
    else:
        print("▶️  Running once")

    print("\n[1/3] Connecting to Supabase...")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        print("   Create a project at https://supabase.com, run web/supabase/schema.sql,")
        print("   then copy the Project URL and service_role key into .env")
        sys.exit(1)
    try:
        db = SupabaseJobStore(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        stats = db.get_statistics()
        print(f"✅ Connected (jobs stored: {stats['total_jobs']})")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    classifier = None
    try:
        classifier = OpenAIClassifier(api_key=OPENAI_API_KEY, model=OPENAI_MODEL)
        if classifier.is_available():
            print(f"[2/3] OpenAI category classifier initialized ✅ ({OPENAI_MODEL})")
        else:
            print("[2/3] OpenAI category classifier disabled (no API key)")
            classifier = None
    except Exception as e:
        print(f"[2/3] OpenAI category classifier error: {e}")
        classifier = None

    print("[3/3] Initializing scraper...")
    scraper = WorkanaScraper()
    try:
        scraper.setup_driver()
        # Last-resort fetcher for detail pages the WAF blocks over plain HTTP.
        set_browser_fetcher(scraper.fetch_html)
    except Exception as e:
        print(f"❌ Failed to start Chrome/Selenium: {e}")
        print("   On Ubuntu VPS, install: apt install -y chromium-browser chromium-chromedriver")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("Setup complete!")
    print("=" * 60)

    try:
        if SCRAPE_INTERVAL:
            run_count = 0
            while True:
                run_count += 1
                print(f"\n{'='*60}")
                print(f"Run #{run_count}")
                print(f"{'='*60}")

                run_scrape(db, scraper, classifier)

                if classifier and classifier.hard_failure:
                    print("\n" + "=" * 60)
                    print(f"❌ Stopping: {classifier.hard_failure}")
                    print("=" * 60)
                    print("   Every scraped job is being discarded by the AI category filter,")
                    print("   which fails closed when it cannot get a verdict. Either:")
                    print("     • fix the OpenAI account/key/model in .env, or")
                    print("     • set AI_CATEGORY_FILTER=0 in .env to store everything that")
                    print("       passes the country / price / payment filters.")
                    break

                if scraper.last_load_failed:
                    try:
                        scraper.restart_driver()
                    except Exception as e:
                        print(f"❌ Failed to restart browser: {e}")

                next_run = datetime.now().timestamp() + SCRAPE_INTERVAL
                next_run_str = datetime.fromtimestamp(next_run).strftime('%H:%M:%S')
                print(f"\n⏰ Next run in {SCRAPE_INTERVAL} seconds (at {next_run_str})")
                print("   Press Ctrl+C to stop")

                time.sleep(SCRAPE_INTERVAL)
        else:
            run_scrape(db, scraper, classifier)
            print("\n✅ Scraping complete!")

    except KeyboardInterrupt:
        print("\n\n⚠️  Scraping interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\nCleaning up...")
        for label, shutdown in (("browser", scraper.close), ("database", db.close)):
            try:
                shutdown()
            except KeyboardInterrupt:
                print(f"   Skipped {label} shutdown (interrupted)")
            except Exception as e:
                print(f"   Could not close {label}: {e}")
        print("Done!")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
