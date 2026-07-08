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
