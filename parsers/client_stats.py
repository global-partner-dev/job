
import re
import time
from typing import Dict, Optional, Tuple, Any

import requests
from bs4 import BeautifulSoup

from config.settings import USER_AGENT, DELAY_BETWEEN_REQUESTS

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
    # Primary: detail page article that starts with "About this project".
    detail_article = soup.select_one("section.block-detail > article")
    if detail_article:
        text = detail_article.get_text("\n", strip=True)
        text = _clean_text(text.replace("\n", " "))
        if text:
            return text

    # Fallback: any section that includes the about-title text.
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


def parse_client_project_stats(html: str) -> Dict[str, Any]:
    stats: Dict[str, Any] = {
        "client_published_projects": None,
        "client_paid_projects": None,
        "client_joined_month": None,
        "client_joined_year": None,
        "title": None,
        "description": None,
    }

    if not html:
        return stats

    soup = BeautifulSoup(html, "lxml")
    stats["title"] = extract_full_project_title(soup)
    stats["description"] = extract_full_project_description(soup)

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

    try:
        response = requests.get(
            job_url,
            headers={"User-Agent": USER_AGENT},
            timeout=15,
        )
        response.encoding = "utf-8"
        if response.status_code != 200:
            print(f"⚠️  Could not fetch client stats ({response.status_code}): {job_url}")
            return empty

        return parse_client_project_stats(response.text)
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error fetching client stats for {job_url}: {e}")
        return empty


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
    job.update({k: v for k, v in stats.items() if v is not None})

    if delay and DELAY_BETWEEN_REQUESTS:
        time.sleep(DELAY_BETWEEN_REQUESTS)

    return job
