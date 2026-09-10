import json
from typing import Optional
import requests


class OpenAIClassifier:
    """
    The one AI step in the scrape pipeline: decide whether a job is one of the
    project types worth keeping. No summarizing — project text is stored exactly
    as posted.
    """

    API_URL = "https://api.openai.com/v1/chat/completions"

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

    # Response bodies that mean "this will never succeed until a human fixes
    # something" — as opposed to a transient rate limit or network blip.
    HARD_ERROR_MARKERS = (
        "billing_not_active",
        "insufficient_quota",
        "invalid_api_key",
        "account_deactivated",
        "model_not_found",
        "does not exist or you do not have access",
    )

    def __init__(self, api_key: str = None, model: str = "gpt-4o-mini"):
        self.api_key = (api_key or "").strip()
        self.model = (model or "gpt-4o-mini").strip()
        self._available = bool(self.api_key)
        # Set to a human-readable reason once a non-recoverable API error is
        # seen, so the caller can stop instead of silently discarding every job.
        self.hard_failure: Optional[str] = None

        if not self._available:
            print("⚠️  Warning: OPENAI_API_KEY not configured; AI category filter disabled")

    def is_available(self) -> bool:
        return self._available

    def _note_http_error(self, label: str, response) -> None:
        """Print an API error and remember it if it can never self-recover."""
        body = (response.text or "")[:200]
        code = response.status_code
        print(f"⚠️  OpenAI {label} error: {code} - {body}")

        if self.hard_failure:
            return

        lowered = body.lower()
        if code in (401, 403, 404) or any(m in lowered for m in self.HARD_ERROR_MARKERS):
            if "model" in lowered and ("not_found" in lowered or "does not exist" in lowered):
                self.hard_failure = (
                    f"the model '{self.model}' is not available to this API key "
                    "(check OPENAI_MODEL in .env)"
                )
            elif code == 401 or "invalid_api_key" in lowered:
                self.hard_failure = "the OpenAI API key is invalid (check OPENAI_API_KEY in .env)"
            else:
                self.hard_failure = (
                    "the OpenAI account is not active / out of quota "
                    "(check billing at platform.openai.com)"
                )

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
                self._note_http_error("classify", response)
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
