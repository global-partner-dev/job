
import re
import time
from typing import Callable, Dict, Optional, Tuple, Any

import requests
from bs4 import BeautifulSoup

from config.settings import JOBS_URL, USER_AGENT, DELAY_BETWEEN_REQUESTS

# Workana sits behind a WAF that rejects bare requests calls. A single User-Agent
# is not enough — it wants the full set of headers a real navigation sends.
BROWSER_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8,pt;q=0.7",
    "Referer": JOBS_URL,
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Sec-CH-UA": '"Chromium";v="120", "Not(A:Brand";v="24", "Google Chrome";v="120"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Connection": "keep-alive",
}

# Statuses that mean "the WAF turned us away", not "this page is missing".
_BLOCKED_STATUSES = (401, 403, 405, 429, 503)

_session = requests.Session()
_session.headers.update(BROWSER_HEADERS)

# Optional last-resort fetcher (the live Selenium browser). Registered by main.py
# so a WAF block can be retried through a real browser that already passed the
# challenge on the listing page.
_browser_fetcher: Optional[Callable[[str], Optional[str]]] = None

# Driving a browser through a Cloudflare challenge costs ~30s and usually fails
# while the block is in force, so a failure benches the fallback for a while
# rather than re-paying that cost on every job of every run.
BROWSER_COOLDOWN_SEC = 15 * 60
_browser_blocked_until = 0.0


def set_browser_fetcher(fetcher: Optional[Callable[[str], Optional[str]]]) -> None:
    """Register a `url -> html` callable used when plain HTTP is blocked."""
    global _browser_fetcher, _browser_blocked_until
    _browser_fetcher = fetcher
    _browser_blocked_until = 0.0


def sync_cookies_from_browser(cookies) -> int:
    """
    Copy the live browser's Workana cookies into the HTTP session.

    The listing page load already cleared whatever challenge the WAF posed, and
    those cookies (cf_clearance and friends) are what make plain requests work.
    Returns how many cookies were adopted.
    """
    count = 0
    for cookie in cookies or []:
        name = cookie.get("name")
        value = cookie.get("value")
        if not name or value is None:
            continue
        try:
            _session.cookies.set(name, value, domain=cookie.get("domain") or ".workana.com")
            count += 1
        except Exception:
            continue
    return count

PUBLISHED_LABELS = (
    "published projects",
    "proyectos publicados",
    "projetos publicados",
    "projectos publicados",
)
PAID_LABELS = (
    "projects paid",
    "proyectos pagos",
    "projetos pagos",
    "projectos pagos",
)
MEMBER_SINCE_LABELS = (
    "member since",
    "miembro desde",
    "membro desde",
)
MONTH_NAME_MAP = {
    # English
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    # Spanish
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
    # Portuguese
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5,
    "junho": 6, "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10,
    "novembro": 11, "dezembro": 12,
}


def parse_member_since(text: str) -> Tuple[Optional[int], Optional[int]]:
    """Parse member-since text and return (month, year)."""
    if not text:
        return None, None

    lowered = text.lower()
    year_match = re.search(r"(20\d{2})", lowered)
    year = int(year_match.group(1)) if year_match else None

    month = None
    # Match month words while being resilient to punctuation
    for token in re.findall(r"[a-zA-ZÀ-ÿ]+", lowered):
        month = MONTH_NAME_MAP.get(token)
        if month is not None:
            break

    return month, year


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def extract_full_project_description(soup: BeautifulSoup) -> Optional[str]:
    # Primary: the full description body ("View more" expanded) lives in
    # div.expander inside the detail block. This is the clean text — no
    # "About this project … Open" breadcrumb and no skills/payment footer.
    expander = (
        soup.select_one("section.block-detail div.expander")
        or soup.select_one("div.expander")
    )
    if expander:
        text = _clean_text(expander.get_text(" ", strip=True))
        if text:
            return text

    # Fallback: the whole detail article (includes some header/footer chrome).
    detail_article = soup.select_one("section.block-detail > article")
    if detail_article:
        text = _clean_text(detail_article.get_text(" ", strip=True))
        if text:
            return text

    # Last resort: the article around the "About this project" heading.
    about_heading = soup.find(string=re.compile(r"about this project", re.I))
    if about_heading:
        container = about_heading.find_parent("article")
        if container:
            text = _clean_text(container.get_text(" ", strip=True))
            if text:
                return text

    return None


def extract_full_project_title(soup: BeautifulSoup) -> Optional[str]:
    title_elem = soup.select_one("h1.h3") or soup.select_one("h1")
    if title_elem:
        title = _clean_text(title_elem.get_text(" ", strip=True))
        if title:
            return title

    title_tag = soup.select_one("title")
    if title_tag:
        raw = _clean_text(title_tag.get_text(" ", strip=True))
        if raw:
            # Example: "<title>Foo - Freelance Job in Wordpress - Workana"
            return raw.split(" - ")[0].strip()

    return None


def is_abbreviated_name(name: Optional[str]) -> bool:
    """
    True when a display name gives no usable first name.

    Workana's LISTING abbreviates most clients to initials ("L. R.", "E. N. C.")
    while the project page carries the real name ("Leticia R."). A leading token
    of one letter is an initial, so greeting the client by it produces "Hi L,".
    """
    first = (name or "").strip().split()
    if not first:
        return True
    return len(first[0].strip(".,;:")) < 2


def extract_client_name(soup: BeautifulSoup) -> Optional[str]:
    """Client display name from the project page sidebar (the unabbreviated one)."""
    for selector in ("aside .h4.user-name span", ".h4.user-name span", ".user-name span", ".user-name"):
        elem = soup.select_one(selector)
        if elem:
            name = _clean_text(elem.get_text(" ", strip=True))
            if name:
                return name
    return None


def parse_client_project_stats(html: str) -> Dict[str, Any]:
    stats: Dict[str, Any] = {
        "client_published_projects": None,
        "client_paid_projects": None,
        "client_joined_month": None,
        "client_joined_year": None,
        "title": None,
        "description": None,
        "client_name": None,
    }

    if not html:
        return stats

    soup = BeautifulSoup(html, "lxml")
    stats["title"] = extract_full_project_title(soup)
    stats["description"] = extract_full_project_description(soup)
    stats["client_name"] = extract_client_name(soup)

    for item in soup.select("div.item-data"):
        value_elem = item.select_one("p.h4")
        label_elem = item.select_one("p:not(.h4)")

        if value_elem and label_elem:
            label = label_elem.get_text(strip=True).lower()
            value_text = value_elem.get_text(strip=True)
            if not re.fullmatch(r"\d+", value_text):
                continue

            value = int(value_text)
            if any(token in label for token in PUBLISHED_LABELS):
                stats["client_published_projects"] = value
            elif any(token in label for token in PAID_LABELS):
                stats["client_paid_projects"] = value
            continue

        text_elem = item.select_one("p")
        if not text_elem:
            continue

        text = text_elem.get_text(strip=True).lower()
        if any(token in text for token in MEMBER_SINCE_LABELS):
            month, year = parse_member_since(text)
            if month is not None:
                stats["client_joined_month"] = month
            if year is not None:
                stats["client_joined_year"] = year

    return stats


def fetch_client_project_stats(job_url: str) -> Dict[str, Any]:
    empty: Dict[str, Any] = {
        "client_published_projects": None,
        "client_paid_projects": None,
        "client_joined_month": None,
        "client_joined_year": None,
        "title": None,
        "description": None,
    }

    if not job_url:
        return empty

    html = _fetch_job_html(job_url)
    if not html:
        return empty
    return parse_client_project_stats(html)


def _fetch_job_html(job_url: str) -> Optional[str]:
    """
    Fetch a job detail page, falling back to the real browser when the WAF
    blocks the plain HTTP request.
    """
    global _browser_blocked_until

    status = None
    try:
        response = _session.get(job_url, timeout=15, allow_redirects=True)
        response.encoding = "utf-8"
        status = response.status_code
        if status == 200:
            return response.text
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error fetching job page for {job_url}: {e}")

    # Not a block (e.g. 404 — the post was taken down): nothing to retry.
    if status is not None and status not in _BLOCKED_STATUSES:
        print(f"⚠️  Could not fetch job page ({status}): {job_url}")
        return None

    if _browser_fetcher is None or time.time() < _browser_blocked_until:
        print(f"⚠️  Could not fetch job page ({status or 'network error'}): {job_url}")
        return None

    html = _browser_fetcher(job_url)
    if not html:
        _browser_blocked_until = time.time() + BROWSER_COOLDOWN_SEC
        mins = BROWSER_COOLDOWN_SEC // 60
        print(
            f"⚠️  Browser fallback also failed ({status}): {job_url}\n"
            f"    Skipping the browser fallback for {mins} min, then retrying it."
        )
        return None
    return html


# Markers Workana leaves when the listing shows only a preview of the brief.
_TRUNCATION_MARKERS = ("view more", "ver más", "ver mas", "ver mais")
MIN_FULL_DESCRIPTION_CHARS = 500


def is_truncated_description(description: Optional[str]) -> bool:
    """
    Whether this text is the listing preview rather than the full brief.

    Listing cards carry ~350 chars ending in "View more"; a real brief runs to
    thousands. Anything short or carrying the marker is treated as incomplete,
    which is the safe direction: callers keep the job instead of judging it on
    text they cannot see.
    """
    text = description or ""
    if not text:
        return True
    lowered = text.lower()
    if any(marker in lowered for marker in _TRUNCATION_MARKERS):
        return True
    return len(text) < MIN_FULL_DESCRIPTION_CHARS


def _client_stats_complete(job: Dict) -> bool:
    return (
        job.get("client_published_projects") is not None
        and job.get("client_paid_projects") is not None
        and job.get("client_joined_month") is not None
        and job.get("client_joined_year") is not None
    )


def enrich_job_with_client_stats(job: Dict, delay: bool = True) -> Dict:
    if _client_stats_complete(job):
        return job

    url = job.get("url")
    if not url:
        return job

    stats = fetch_client_project_stats(url)

    # The project page name replaces the listing's initials, but never the other
    # way round — if the page came back abbreviated, keep what we already had.
    detail_name = stats.pop("client_name", None)
    if detail_name and is_abbreviated_name(job.get("client_name")) and not is_abbreviated_name(detail_name):
        job["client_name"] = detail_name

    job.update({k: v for k, v in stats.items() if v is not None})

    if delay and DELAY_BETWEEN_REQUESTS:
        time.sleep(DELAY_BETWEEN_REQUESTS)

    return job
