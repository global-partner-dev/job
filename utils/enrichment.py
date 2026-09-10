"""
AI category filter for scraped jobs.

The scrape pipeline stores project text exactly as posted — no translation and
no generated summary. The only thing the model is asked is a yes/no triage
question: is this one of the project types worth keeping?
"""
from typing import Dict, Optional

from parsers.client_stats import is_truncated_description
from utils.openai_classifier import OpenAIClassifier

# Written to ``ai_category`` when the full brief was never fetched, so the row
# is distinguishable from one the model actually looked at.
UNJUDGED = "unjudged_truncated"


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

    Returns True if the job should be kept.

    Two different "no verdict" cases, deliberately resolved in opposite
    directions:

    * **Truncated description** — we never fetched the full brief, so there is
      nothing meaningful to classify. Fails OPEN (job kept, no API call): the
      input is at fault, and discarding on a preview loses real work.
    * **Classifier unavailable or API error** — the input was fine but the
      verdict could not be obtained. Fails CLOSED: the job is skipped this run
      and re-evaluated later, so a transient error never lets an off-target job
      slip permanently into the archive.
    """
    description = job.get("description") or ""

    # The classifier only ever sees what we managed to fetch. When Workana's
    # detail page is blocked all we have is the ~350-char listing preview —
    # roughly a tenth of the brief — and a verdict from that is a guess, not a
    # filter. Keep the job unjudged rather than discard it on data we never saw,
    # and skip the API call that would only have rubber-stamped the guess.
    if is_truncated_description(description):
        job["ai_category"] = UNJUDGED
        job["ai_category_reason"] = (
            "Full description unavailable (listing preview only) — kept without an AI verdict."
        )
        return True

    if not (classifier and classifier.is_available()):
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
