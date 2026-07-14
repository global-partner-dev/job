"""
Archive filters — only projects that pass ALL of these are stored:

  1. Country/region: allow only the Americas + Spain & Portugal.
     (All of Asia, Africa, Oceania, and the rest of Europe are excluded.)
  2. Price: exclude fixed-price projects under $101.
  3. Client payment ability: exclude clients who posted 2+ projects but have
     paid for none (published >= 2 and paid == 0).
"""
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


def passes_listing_filters(job: Dict) -> Tuple[bool, str]:
    """Cheap filters from the listing (no detail-page fetch needed)."""
    if not passes_country(job):
        return False, f"country not allowed: {job.get('client_country') or 'unknown'}"
    if not passes_price(job):
        return False, f"budget under ${MIN_BUDGET_USD}: {job.get('budget') or 'n/a'}"
    return True, ""


def passes_client_filters(job: Dict) -> Tuple[bool, str]:
    """Filters that need the enriched client stats (from the detail page)."""
    if not passes_payment_ability(job):
        return (
            False,
            f"non-payer: {job.get('client_published_projects')} published, 0 paid",
        )
    return True, ""
