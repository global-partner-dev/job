"""
One-off: delete archived jobs that don't pass the new filters (country / price /
payer / WhatsApp-template). New scrapes are already filtered; this cleans out the pre-filter backlog.

Note: deleting a job cascades to any bid records on it.

    python purge_nonpassing.py
"""
import sys

sys.path.insert(0, ".")

from config.settings import SUPABASE_URL, SUPABASE_SERVICE_KEY
from supabase import create_client
from parsers.filters import (
    passes_country, passes_price, passes_payment_ability, passes_not_template,
)


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
        sys.exit(1)
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    cols = "id,title,description,skills,client_country,budget,budget_min,budget_max,budget_type,client_published_projects,client_paid_projects"
    rows = (client.table("jobs").select(cols).execute()).data or []

    drop = [
        r["id"]
        for r in rows
        if not (
            passes_country(r)
            and passes_price(r)
            and passes_payment_ability(r)
            and passes_not_template(r)
        )
    ]
    print(f"{len(rows)} jobs in DB · {len(drop)} fail the filters and will be deleted")

    for i in range(0, len(drop), 50):
        batch = drop[i : i + 50]
        client.table("jobs").delete().in_("id", batch).execute()
        print(f"  deleted {i + len(batch)}/{len(drop)}")

    print(f"Done — {len(rows) - len(drop)} passing jobs remain")


if __name__ == "__main__":
    main()
