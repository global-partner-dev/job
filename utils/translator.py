"""
Translation utility using Google Cloud Translation API v2.
"""
from typing import Optional
import requests


class GoogleTranslator:
    """Translate job content to English using Google Cloud Translation API."""

    API_URL = "https://translation.googleapis.com/language/translate/v2"

    def __init__(self, api_key: str = None):
        """
        Initialize Google Translate client.

        Args:
            api_key: Google Cloud Translation API key
        """
        self.api_key = (api_key or "").strip()
        self._available = bool(self.api_key)

        if not self._available:
            print("⚠️  Warning: GOOGLE_TRANSLATE_API_KEY not configured; translation disabled")

    def is_available(self) -> bool:
        """Check if translator is available."""
        return self._available

    def _normalize_target(self, target_lang: str) -> str:
        """Normalize target language code for Google Translate API."""
        if not target_lang:
            return "en"

        lang = target_lang.lower().replace("_", "-")
        if lang.startswith("en"):
            return "en"
        if lang.startswith("es"):
            return "es"
        if lang.startswith("pt"):
            return "pt"
        if lang.startswith("de"):
            return "de"
        if lang.startswith("fr"):
            return "fr"
        return "en"

    def translate_text(
        self,
        text: str,
        target_lang: str = "en",
        source_lang: str = None,
    ) -> Optional[str]:
        """
        Translate text to target language.

        Args:
            text: Text to translate
            target_lang: Target language code (defaults to English)
            source_lang: Optional source language code (auto-detected if omitted)

        Returns:
            Translated text or None if translation fails
        """
        if not self._available:
            return None

        if not text or not text.strip():
            return text

        params = {
            "key": self.api_key,
            "q": text,
            "target": self._normalize_target(target_lang),
            "format": "text",
        }
        if source_lang:
            params["source"] = source_lang

        try:
            response = requests.post(self.API_URL, params=params, timeout=15)
            if response.status_code != 200:
                print(f"⚠️  Translation API error: {response.status_code} - {response.text[:200]}")
                return None

            data = response.json()
            translations = data.get("data", {}).get("translations", [])
            if not translations:
                return None

            return translations[0].get("translatedText")
        except requests.exceptions.RequestException as e:
            print(f"⚠️  Translation request error: {e}")
            return None
        except Exception as e:
            print(f"⚠️  Translation error: {e}")
            return None

    def translate_job_description(self, description: str) -> Optional[str]:
        """
        Translate job description to English.

        Returns original description if translation fails or translator is disabled.
        """
        if not description:
            return description

        translated = self.translate_text(description, target_lang="en")
        return translated if translated else description

    def translate_job_data(self, job_data: dict) -> dict:
        """
        Translate job data fields (title, description) to English.

        Returns:
            Job data with translated fields (or original values on failure).
        """
        if not self._available:
            return job_data

        translated_job = job_data.copy()

        if job_data.get("title"):
            translated_title = self.translate_text(job_data["title"], target_lang="en")
            if translated_title:
                translated_job["title"] = translated_title

        if job_data.get("description"):
            translated_desc = self.translate_job_description(job_data["description"])
            if translated_desc:
                translated_job["description"] = translated_desc

        return translated_job


# Backwards-compatible alias
DeepLTranslator = GoogleTranslator
