from typing import Optional
import requests


class OpenAISummarizer:
    API_URL = "https://api.openai.com/v1/chat/completions"
    DEFAULT_MAX_WORDS = 70

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
