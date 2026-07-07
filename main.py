import sys
import time
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import (
    DEFAULT_CATEGORY, DEFAULT_LANGUAGE, MAX_PAGES,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    GOOGLE_TRANSLATE_API_KEY, OPENAI_API_KEY, OPENAI_MODEL,
    SCRAPE_INTERVAL,
)
from storage.supabase_store import SupabaseJobStore
from scrapers.workana_scraper import WorkanaScraper
from parsers.client_stats import enrich_job_with_client_stats
from utils.enrichment import enrich_job_with_ai
from utils.translator import GoogleTranslator
from utils.openai_summarizer import OpenAISummarizer


def run_scrape(db, scraper, translator, summarizer):
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

        # Only the jobs we've never stored before are worth enriching (saves API calls).
        new_scraped = [j for j in scraped_jobs if j.get('id') and db.job_is_new(j['id'])]
        print(f"New jobs this run: {len(new_scraped)}")

        # Enrich new jobs with client project stats from their detail pages.
        if new_scraped:
            print("Fetching client project stats from job pages...")
            for i, job in enumerate(new_scraped, 1):
                if not job.get('url'):
                    continue
                enrich_job_with_client_stats(job, delay=i < len(new_scraped))
                published = job.get('client_published_projects')
                paid = job.get('client_paid_projects')
                joined_month = job.get('client_joined_month')
                joined = job.get('client_joined_year')
                if published is not None or paid is not None or joined is not None:
                    print(
                        f"   [{i}/{len(new_scraped)}] "
                        f"{(job.get('title') or 'Unknown')[:40]}... "
                        f"Published: {published if published is not None else '?'} | "
                        f"Paid: {paid if paid is not None else '?'} | "
                        f"Joined: {joined_month if joined_month is not None else '?'}-{joined if joined is not None else '?'}"
                    )

            # Enrich new jobs with English translation + AI analysis for the web app.
            if translator or summarizer:
                print("Adding translations + AI analysis...")
                for i, job in enumerate(new_scraped, 1):
                    enrich_job_with_ai(job, translator=translator, summarizer=summarizer)
                    if job.get('ai_summary'):
                        print(f"   [{i}/{len(new_scraped)}] AI analysis ready: {(job.get('title') or 'Unknown')[:40]}...")

        # Persist every scraped job (upsert): new ones inserted, seen ones refreshed.
        new_jobs = []
        updated_jobs = 0
        for job in scraped_jobs:
            if not job.get('id'):
                continue
            is_new = db.save_job(job)
            if is_new:
                new_jobs.append(job)
            else:
                updated_jobs += 1

        print(f"Saved to Supabase — New: {len(new_jobs)} | Updated: {updated_jobs}")

        pages_scraped = max(1, len(scraped_jobs) // 20)
        duration = time.time() - start_time
        db.save_scrape_history(
            jobs_found=len(scraped_jobs),
            new_jobs_count=len(new_jobs),
            pages_scraped=pages_scraped,
            duration_seconds=duration,
            category=DEFAULT_CATEGORY,
            language=DEFAULT_LANGUAGE,
        )

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

    print("\n[1/4] Connecting to Supabase...")
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

    translator = None
    try:
        translator = GoogleTranslator(api_key=GOOGLE_TRANSLATE_API_KEY)
        if translator.is_available():
            print("[2/4] Google Translate initialized ✅")
        else:
            print("[2/4] Google Translate disabled (no API key)")
            translator = None
    except Exception as e:
        print(f"[2/4] Google Translate error: {e}")
        translator = None

    summarizer = None
    try:
        summarizer = OpenAISummarizer(api_key=OPENAI_API_KEY, model=OPENAI_MODEL)
        if summarizer.is_available():
            print(f"[3/4] OpenAI summarizer initialized ✅ ({OPENAI_MODEL})")
        else:
            print("[3/4] OpenAI summarizer disabled (no API key)")
            summarizer = None
    except Exception as e:
        print(f"[3/4] OpenAI summarizer error: {e}")
        summarizer = None

    print("[4/4] Initializing scraper...")
    scraper = WorkanaScraper()
    try:
        scraper.setup_driver()
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

                run_scrape(db, scraper, translator, summarizer)

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
            run_scrape(db, scraper, translator, summarizer)
            print("\n✅ Scraping complete!")

    except KeyboardInterrupt:
        print("\n\n⚠️  Scraping interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\nCleaning up...")
        scraper.close()
        db.close()
        print("Done!")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
