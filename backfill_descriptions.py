"""
One-off: backfill full job descriptions from Workana detail pages.

Existing rows may hold the truncated listing description ("…View more"). This
re-fetches each job's detail page and stores the full description.

IMPORTANT: run this AFTER restarting the scraper with the current code — the
scraper now preserves the full description on re-scrape, so backfilled rows
won't be clobbered again. If the OLD scraper is still running, it will overwrite
these updates within ~30s.

    python backfill_descriptions.py
"""
import sys
import time

sys.path.insert(0, ".")

from config.settings import SUPABASE_URL, SUPABASE_SERVICE_KEY, DELAY_BETWEEN_REQUESTS
from supabase import create_client
from parsers.client_stats import fetch_client_project_stats


def is_truncated(desc: str) -> bool:
    d = desc or ""
    if not d:
        return True
    lowered = d.lower()
    return (
        "view more" in lowered
        or "ver más" in lowered
        or "ver mas" in lowered
        or "ver mais" in lowered
        or len(d) < 500
    )


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    rows = (client.table("jobs").select("id,url,description").execute()).data or []
    todo = [r for r in rows if r.get("url") and is_truncated(r.get("description"))]
    print(f"{len(rows)} jobs in DB · {len(todo)} with truncated descriptions to backfill")

    updated = 0
    failed = 0
    for i, row in enumerate(todo, 1):
        try:
            stats = fetch_client_project_stats(row["url"])
            desc = stats.get("description") or ""
            current = row.get("description") or ""
            if desc and len(desc) > len(current):
                patch = {"description": desc}
                title = stats.get("title")
                if title:
                    patch["title"] = title
                client.table("jobs").update(patch).eq("id", row["id"]).execute()
                updated += 1
                print(f"  [{i}/{len(todo)}] ✓ {len(desc)} chars — {row['id'][:55]}")
            else:
                print(f"  [{i}/{len(todo)}] – no fuller text found — {row['id'][:55]}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  [{i}/{len(todo)}] ✗ {e}")
        time.sleep(max(0.5, DELAY_BETWEEN_REQUESTS))

    print(f"\nDone — updated {updated}, unchanged/failed {len(todo) - updated} (errors: {failed})")


if __name__ == "__main__":
    main()
