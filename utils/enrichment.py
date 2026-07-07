"""
AI enrichment for scraped jobs.

Adds English translations and an OpenAI "AI analysis" summary to a job dict so
the data can be stored in Supabase and surfaced in the web app. This logic used
to live in the (now removed) Telegram notifier; it now feeds the database.
"""
from typing import Dict, Optional

from utils.translator import GoogleTranslator
from utils.openai_summarizer import OpenAISummarizer


def _translate(translator: Optional[GoogleTranslator], text: str) -> Optional[str]:
    if not text or not translator or not translator.is_available():
        return None
    try:
        translated = translator.translate_text(text, target_lang="en")
        # Only keep it if translation actually changed something meaningful.
        return translated or None
    except Exception as exc:  # pragma: no cover - defensive
        print(f"⚠️  Translation failed: {exc}")
        return None


def enrich_job_with_ai(
    job: Dict,
    translator: Optional[GoogleTranslator] = None,
    summarizer: Optional[OpenAISummarizer] = None,
) -> Dict:
    """
    Populate ``title_en``, ``description_en`` and ``ai_summary`` on the job.

    The English fields fall back to ``None`` when translation is unavailable
    (the web app then displays the original text). ``ai_summary`` keeps the
    model's ``**bold**`` markdown so the frontend can render emphasis.
    """
    title = job.get("title") or ""
    description = job.get("description") or ""

    title_en = _translate(translator, title)
    description_en = _translate(translator, description)

    job["title_en"] = title_en
    job["description_en"] = description_en

    if summarizer and summarizer.is_available() and description:
        try:
            # Summarize the English text when we have it, else the original.
            summary = summarizer.summarize_job(
                title=title_en or title,
                description=description_en or description,
            )
            job["ai_summary"] = summary or None
        except Exception as exc:  # pragma: no cover - defensive
            print(f"⚠️  AI summary failed: {exc}")
            job["ai_summary"] = None
    else:
        job.setdefault("ai_summary", None)

    return job
