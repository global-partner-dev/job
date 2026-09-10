"""
Supabase (PostgREST) storage backend for Workana job scraping.

Replaces the local SQLite store. The scraper writes with the Supabase
service-role key (bypasses RLS); the React web app reads with the anon key
under a read-only RLS policy. See supabase/schema.sql.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from supabase import create_client, Client


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_iso(value: Any) -> Optional[str]:
    """Coerce a datetime (or already-serialized value) to an ISO 8601 string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


class SupabaseJobStore:
    """Stores scraped jobs in Supabase Postgres."""

    JOBS_TABLE = "jobs"
    PAGE_SIZE = 1000

    def __init__(self, url: str, key: str):
        if not url or not key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY are required to use the Supabase store"
            )
        self.client: Client = create_client(url, key)
        # Cache of job IDs already stored, kept in sync as we save.
        self._existing_ids: Set[str] = set()

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------
    def get_existing_job_ids(self) -> Set[str]:
        """
        Return composite keys ``id|client_name`` for every stored job, matching
        the scraper's dedup logic. Also refreshes the internal id cache used to
        decide whether a saved job is new.
        """
        keys: Set[str] = set()
        ids: Set[str] = set()
        page = 0
        while True:
            start = page * self.PAGE_SIZE
            end = start + self.PAGE_SIZE - 1
            resp = (
                self.client.table(self.JOBS_TABLE)
                .select("id, client_name")
                .range(start, end)
                .execute()
            )
            rows = resp.data or []
            for row in rows:
                job_id = row.get("id")
                client_name = row.get("client_name") or ""
                if job_id:
                    ids.add(job_id)
                    keys.add(f"{job_id}|{client_name}")
            if len(rows) < self.PAGE_SIZE:
                break
            page += 1

        self._existing_ids = ids
        return keys

    def job_is_new(self, job_id: str) -> bool:
        """True if this job id has not been stored yet (per the cached id set)."""
        return bool(job_id) and job_id not in self._existing_ids

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------
    def _to_record(self, job: Dict, is_new: bool) -> Dict[str, Any]:
        now = _utc_now_iso()

        skills = job.get("skills")
        if isinstance(skills, str):
            try:
                skills = json.loads(skills)
            except (ValueError, TypeError):
                skills = [skills] if skills else []

        record: Dict[str, Any] = {
            "id": job.get("id"),
            "title": job.get("title"),
            "description": job.get("description"),
            "ai_summary": job.get("ai_summary"),
            "ai_category": job.get("ai_category"),
            "ai_category_reason": job.get("ai_category_reason"),
            "url": job.get("url"),
            "posted_date_relative": job.get("posted_date_relative"),
            "posted_date_timestamp": _to_iso(job.get("posted_date_timestamp")),
            "bids_count": job.get("bids_count"),
            "budget": job.get("budget"),
            "budget_min": job.get("budget_min"),
            "budget_max": job.get("budget_max"),
            "budget_type": job.get("budget_type"),
            "skills": skills,
            "client_name": job.get("client_name"),
            "client_country": job.get("client_country"),
            "client_rating": job.get("client_rating"),
            "client_payment_verified": bool(job.get("client_payment_verified", False)),
            "client_last_reply": job.get("client_last_reply"),
            "client_published_projects": job.get("client_published_projects"),
            "client_paid_projects": job.get("client_paid_projects"),
            "client_joined_month": job.get("client_joined_month"),
            "client_joined_year": job.get("client_joined_year"),
            "is_featured": bool(job.get("is_featured", False)),
            "is_max_project": bool(job.get("is_max_project", False)),
            "scraped_at": now,
            "last_seen_at": now,
        }
        if is_new:
            record["first_seen_at"] = now

        # Drop None values so an update never nulls a previously-known field
        # (e.g. re-scraping the listing without re-enriching AI fields).
        return {k: v for k, v in record.items() if v is not None}

    def save_job(self, job_data: Dict) -> bool:
        """
        Upsert a job. Returns True if the job is new, False if it already existed.
        """
        job_id = job_data.get("id")
        if not job_id:
            return False

        is_new = job_id not in self._existing_ids
        record = self._to_record(job_data, is_new)

        if not is_new:
            # Re-scrapes only carry the truncated LISTING title/description, so
            # never overwrite the full detail-page content (or the AI fields) we
            # stored when the job was first seen and enriched. Volatile listing
            # fields (bids, budget, last reply, timestamps) still update.
            for field in ("title", "description",
                          "ai_summary", "ai_category", "ai_category_reason"):
                record.pop(field, None)

        self.client.table(self.JOBS_TABLE).upsert(record).execute()
        self._existing_ids.add(job_id)
        return is_new

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------
    def _count(self, table: str, apply=None) -> int:
        query = self.client.table(table).select("id", count="exact").limit(1)
        if apply is not None:
            query = apply(query)
        resp = query.execute()
        return resp.count or 0

    def get_statistics(self) -> Dict[str, int]:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        return {
            "total_jobs": self._count(self.JOBS_TABLE),
            "new_jobs_24h": self._count(
                self.JOBS_TABLE, lambda q: q.gte("first_seen_at", since)
            ),
        }

    def close(self) -> None:
        """No persistent connection to close (PostgREST over HTTP)."""
        return None
