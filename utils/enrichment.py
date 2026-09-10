"""
AI category filter for scraped jobs.

The scrape pipeline stores project text exactly as posted — no translation and
no generated summary. The only thing the model is asked is a yes/no triage
question: is this one of the project types worth keeping?
"""
from typing import Dict, Optional

from utils.openai_classifier import OpenAIClassifier


def job_matches_target_category(
    job: Dict,
    classifier: Optional[OpenAIClassifier] = None,
) -> bool:
    """
    Keep only jobs that are one of the target project types.

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

    if not (classifier and classifier.is_available() and description):
        job.setdefault("ai_category", None)
        job.setdefault("ai_category_reason", None)
        return False

    verdict = classifier.classify_job(
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
