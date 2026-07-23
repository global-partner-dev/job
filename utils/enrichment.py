"""
AI enrichment for scraped jobs.

Adds an OpenAI "AI analysis" summary to a job dict so it can be stored in
Supabase and surfaced in the web app. The summary is written in English even
when the source post is in Spanish/Portuguese, so no translation step is needed.
"""
from typing import Dict, Optional

from utils.openai_summarizer import OpenAISummarizer


def enrich_job_with_ai(
    job: Dict,
    summarizer: Optional[OpenAISummarizer] = None,
) -> Dict:
    """
    Populate ``ai_summary`` on the job from its title + description.

    The model returns a concise English paragraph (with ``**bold**`` markdown
    the frontend renders as emphasis), regardless of the source language.
    """
    description = job.get("description") or ""

    if summarizer and summarizer.is_available() and description:
        try:
            summary = summarizer.summarize_job(
                title=job.get("title") or "",
                description=description,
            )
            job["ai_summary"] = summary or None
        except Exception as exc:  # pragma: no cover - defensive
            print(f"⚠️  AI summary failed: {exc}")
            job["ai_summary"] = None
    else:
        job.setdefault("ai_summary", None)

    return job


def job_matches_target_category(
    job: Dict,
    summarizer: Optional[OpenAISummarizer] = None,
) -> bool:
    """
    AI category filter: keep only jobs that are one of the target project types.

    Uses the OpenAI classifier to decide whether the job is a SaaS platform,
    a corporate/service website (non-WordPress), a custom CRM/ERP, a Python
    app / API integration, or a Shopify project. Stores the verdict on the job
    (``ai_category`` / ``ai_category_reason``) for persistence and debugging.

    Returns True if the job should be kept. When the classifier is unavailable
    or a verdict cannot be obtained, returns False (fail-closed): the job is not
    stored this run and will be re-evaluated on a later scrape, so a transient
    API error never lets an off-target job slip into the archive.
    """
    description = job.get("description") or ""

    if not (summarizer and summarizer.is_available() and description):
        job.setdefault("ai_category", None)
        job.setdefault("ai_category_reason", None)
        return False

    verdict = summarizer.classify_job(
        title=job.get("title") or "",
        description=description,
    )
    if not verdict:
        # Inconclusive (API/network error): fail closed, retry on a later run.
        job.setdefault("ai_category", None)
        job.setdefault("ai_category_reason", None)
        return False

    job["ai_category"] = verdict.get("category")
    job["ai_category_reason"] = verdict.get("reason")
    return bool(verdict.get("match"))
