import json
from typing import Optional
import requests


class OpenAISummarizer:
    API_URL = "https://api.openai.com/v1/chat/completions"
    DEFAULT_MAX_WORDS = 70

    # Project types the user is willing to bid on. The AI classifier maps every
    # job to exactly one of these labels, or to NO_MATCH. Kept in sync with the
    # human-readable descriptions in the classify prompt below.
    TARGET_CATEGORIES = (
        "saas_platform",
        "corporate_service_website",   # excludes WordPress-based sites
        "custom_crm_erp",
        "python_app_or_api_integration",
        "shopify_project",
    )
    NO_MATCH = "no_match"

    def __init__(self, api_key: str = None, model: str = "gpt-4o-mini"):
        self.api_key = (api_key or "").strip()
        self.model = (model or "gpt-4o-mini").strip()
        self._available = bool(self.api_key)

        if not self._available:
            print("⚠️  Warning: OPENAI_API_KEY not configured; AI summary disabled")

    def is_available(self) -> bool:
        return self._available

    def summarize_job(
        self,
        title: str,
        description: str,
        max_words: int = DEFAULT_MAX_WORDS,
    ) -> Optional[str]:
        if not self._available:
            return None
        if not description:
            return None

        system_prompt = (
            "You are an expert assistant for freelance job triage. "
            "Analyze job posts and extract the client's core requirements in clear English."
        )
        user_prompt = (
            f"Job title: {title or 'N/A'}\n\n"
            f"Full description:\n{description}\n\n"
            "Content rules:\n"
            "- Analyze and summarize the client's core requirements: what needs to be built or done, "
            "must-have skills, project scope, and expected outcomes.\n"
            "- Prioritize explicit requirements. Ignore company culture, soft traits, and nice-to-haves.\n\n"
            "Format rules:\n"
            f"- Write exactly one paragraph under {max_words} words.\n"
            "- Bold exactly 3–5 phrases using **double asterisks** — only specific skills, tools, "
            "deliverables, or hard constraints.\n"
            "- No bullets, headers, or labels. Plain prose only.\n\n"
            "Example output:\n"
            "The client needs a **senior React developer** to build a **data dashboard from scratch** "
            "using **TypeScript and REST APIs**, with charts updating in real time. "
            "The project is fixed-scope with a 6-week deadline.\n"
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                self.API_URL,
                headers=headers,
                json=payload,
                timeout=25,
            )
            if response.status_code != 200:
                print(f"⚠️  OpenAI summary error: {response.status_code} - {response.text[:200]}")
                return None

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                return None

            content = choices[0].get("message", {}).get("content", "")
            summary = " ".join((content or "").split()).strip()
            # Hard cap to guarantee compact UI even if model ignores the prompt.
            words = summary.split()
            if len(words) > max_words:
                summary = " ".join(words[:max_words]).rstrip(".,;:!?") + "..."
            return summary if summary else None
        except requests.exceptions.RequestException as e:
            print(f"⚠️  OpenAI summary request error: {e}")
            return None
        except Exception as e:
            print(f"⚠️  OpenAI summary unexpected error: {e}")
            return None

    def classify_job(self, title: str, description: str) -> Optional[dict]:
        """
        Decide whether a job is one of the project types the user bids on.

        Returns a dict ``{"match": bool, "category": str, "reason": str}`` where
        ``category`` is one of ``TARGET_CATEGORIES`` when ``match`` is True, or
        ``NO_MATCH`` otherwise. Returns ``None`` if the classification could not
        be obtained (no API key, network/API error, or unparseable response) so
        the caller can decide how to handle an inconclusive verdict.
        """
        if not self._available:
            return None
        if not description:
            return None

        system_prompt = (
            "You are a strict triage classifier for a freelance developer. "
            "You decide whether a job post matches ONE of a fixed set of project "
            "types the developer is willing to bid on. Be conservative: if the "
            "post does not clearly fit a target type, return no_match."
        )
        user_prompt = (
            f"Job title: {title or 'N/A'}\n\n"
            f"Full description:\n{description}\n\n"
            "The developer ONLY bids on these project types:\n"
            "1. saas_platform — building or extending a SaaS / multi-tenant web "
            "platform or web application delivered as a subscription service.\n"
            "2. corporate_service_website — corporate, business, portfolio, or "
            "service websites and landing pages. EXCLUDE anything built on or "
            "requiring WordPress (or WordPress themes/plugins/Elementor/WooCommerce) "
            "— those must be classified as no_match.\n"
            "3. custom_crm_erp — custom CRM or ERP systems (not off-the-shelf "
            "setup/config of an existing product).\n"
            "4. python_app_or_api_integration — Python desktop applications, "
            "automation/scripts, or third-party API integrations (e.g. Google "
            "Sheets, Google Colab, REST APIs, scraping/automation tooling).\n"
            "5. shopify_project — Shopify stores, themes, apps, or customization.\n\n"
            "Rules:\n"
            "- Pick the single best-fitting category, or no_match if none fit.\n"
            "- WordPress website work is ALWAYS no_match, even if it looks "
            "corporate.\n"
            "- If the post is generic, unrelated (e.g. mobile-only app, design-"
            "only, marketing, data entry, WordPress), or too vague to tell, "
            "return no_match.\n\n"
            "Respond with ONLY a JSON object of the form:\n"
            '{"category": "<one of: saas_platform, corporate_service_website, '
            'custom_crm_erp, python_app_or_api_integration, shopify_project, '
            'no_match>", "reason": "<short justification>"}'
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                self.API_URL,
                headers=headers,
                json=payload,
                timeout=25,
            )
            if response.status_code != 200:
                print(f"⚠️  OpenAI classify error: {response.status_code} - {response.text[:200]}")
                return None

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                return None

            content = choices[0].get("message", {}).get("content", "") or ""
            parsed = json.loads(content)
            category = str(parsed.get("category", "")).strip().lower()
            reason = str(parsed.get("reason", "")).strip()

            if category not in self.TARGET_CATEGORIES:
                # Anything the model returns that isn't an explicit target
                # (including "no_match" or a hallucinated label) is a no-match.
                return {"match": False, "category": self.NO_MATCH, "reason": reason}
            return {"match": True, "category": category, "reason": reason}
        except (ValueError, TypeError) as e:
            print(f"⚠️  OpenAI classify parse error: {e}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"⚠️  OpenAI classify request error: {e}")
            return None
        except Exception as e:
            print(f"⚠️  OpenAI classify unexpected error: {e}")
            return None
