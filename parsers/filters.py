"""
Archive filters — only projects that pass ALL of these are stored:

  1. Country/region: allow only the Americas + Spain & Portugal.
     (All of Asia, Africa, Oceania, and the rest of Europe are excluded.)
  2. Price: exclude fixed-price projects under $101.
  3. Client payment ability: exclude clients who posted 2+ projects but have
     paid for none (published >= 2 and paid == 0).
  4. Template projects: exclude WhatsApp chatbot / WhatsApp automation posts.
     These are boilerplate listings (e.g. "Seeking an expert in automated
     WhatsApp messaging responses") that people publish only to collect bids.
"""
import re
from typing import Dict, Optional, Tuple

MIN_BUDGET_USD = 101  # exclude fixed-price projects under this
NONPAYER_MIN_PUBLISHED = 2

# Allowed client countries: the whole Americas + Spain & Portugal only.
ALLOWED_COUNTRIES = {
    # --- North America ---
    "united states", "usa", "us", "u.s.", "u.s.a.",
    "canada", "mexico", "méxico",
    # --- Central America & Caribbean ---
    "guatemala", "belize", "honduras", "el salvador", "nicaragua",
    "costa rica", "panama", "panamá", "cuba",
    "dominican republic", "república dominicana", "haiti",
    "jamaica", "bahamas", "barbados", "trinidad and tobago",
    "puerto rico", "aruba", "curaçao", "curacao",
    # --- South America ---
    "brazil", "brasil", "argentina", "chile", "colombia",
    "peru", "perú", "venezuela", "ecuador", "bolivia",
    "paraguay", "uruguay", "guyana", "suriname", "french guiana",
    # --- Europe (ONLY these two) ---
    "spain", "españa", "portugal",
}


# WhatsApp mention (incl. "whats app", "whats-app" and the Brazilian "wpp").
_WHATSAPP_RE = re.compile(r"whats[\s\-]?app|\bwpp\b", re.IGNORECASE)

# Automation / bot vocabulary in English, Spanish and Portuguese.
_AUTOMATION_RE = re.compile(
    r"\bbots?\b|chat[\s\-]?bots?|\bautoma[tçc]|\bautoresp|auto[\s\-]?respon|"
    r"\bauto[\s\-]?repl|\bautoatend|respuestas?\s+autom|respostas?\s+autom|"
    r"mensajes?\s+autom|mensagens?\s+autom|messag\w*\s+response|"
    r"\bmass\s+messag|mensajes?\s+masiv|mensagens?\s+em\s+massa|envio\s+em\s+massa|"
    r"\bapi\b.*\bwhats|\bwhats\w*\b.*\bapi\b",
    re.IGNORECASE,
)

# How much of the description counts as "the project is about WhatsApp". A long
# brief that mentions WhatsApp in passing (e.g. a CRM with WhatsApp
# notifications) is a real project; a template opens with it.
_TEMPLATE_LEAD_CHARS = 250


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def passes_country(job: Dict) -> bool:
    """Allow only the Americas + Spain/Portugal. Unknown country is excluded."""
    return _norm(job.get("client_country")) in ALLOWED_COUNTRIES


def passes_price(job: Dict, min_budget: float = MIN_BUDGET_USD) -> bool:
    """Exclude fixed-price projects under `min_budget`. Hourly / no-budget kept."""
    if _norm(job.get("budget_type")) == "hourly":
        return True
    min_b = job.get("budget_min")
    max_b = job.get("budget_max")
    if min_b is None and max_b is None:
        return True  # no stated budget → can't judge → keep
    # "Less than USD X" parses to (min=None, max=X): the value is below X.
    if min_b is None and max_b is not None:
        return max_b > min_budget
    ceiling = max_b if max_b is not None else min_b
    return ceiling >= min_budget


def passes_payment_ability(job: Dict, min_published: int = NONPAYER_MIN_PUBLISHED) -> bool:
    """Exclude clients with `min_published`+ posts but zero paid projects."""
    published = job.get("client_published_projects")
    paid = job.get("client_paid_projects")
    if published is None or paid is None:
        return True  # unknown history → keep (benefit of the doubt)
    return not (paid == 0 and published >= min_published)


def is_template_project(job: Dict) -> bool:
    """
    True for WhatsApp chatbot / WhatsApp automation template posts.

    WhatsApp has to be the subject — in the title or the opening of the brief —
    and the post has to be about bots or automation anywhere in title + brief.
    """
    title = job.get("title") or ""
    description = job.get("description") or ""
    lead = f"{title}\n{description[:_TEMPLATE_LEAD_CHARS]}"
    if not _WHATSAPP_RE.search(lead):
        return False
    return bool(_AUTOMATION_RE.search(f"{title}\n{description}"))


def passes_not_template(job: Dict) -> bool:
    """Exclude WhatsApp chatbot / automation template projects."""
    return not is_template_project(job)


def passes_listing_filters(job: Dict) -> Tuple[bool, str]:
    """Cheap filters from the listing (no detail-page fetch needed)."""
    if not passes_country(job):
        return False, f"country not allowed: {job.get('client_country') or 'unknown'}"
    if not passes_price(job):
        return False, f"budget under ${MIN_BUDGET_USD}: {job.get('budget') or 'n/a'}"
    if not passes_not_template(job):
        return False, "template project (WhatsApp chatbot / automation)"
    return True, ""


def passes_client_filters(job: Dict) -> Tuple[bool, str]:
    """Filters that need the enriched client stats (from the detail page)."""
    if not passes_payment_ability(job):
        return (
            False,
            f"non-payer: {job.get('client_published_projects')} published, 0 paid",
        )
    # The listing only carries a ~350-char preview; the full brief is known now.
    if not passes_not_template(job):
        return False, "template project (WhatsApp chatbot / automation)"
    return True, ""
