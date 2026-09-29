"""Shared Gemini LLM factory (report 5.2: configured language-model API)."""
import time

from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import settings


def get_llm(temperature: float = 0.0, lite: bool = False) -> ChatGoogleGenerativeAI:
    """Return a Gemini chat model.

    lite=True selects the flash-lite model: free-tier quotas are per-model, so
    routing simple extraction agents to the lite model uses a separate quota
    bucket and keeps the main model's budget for classification/resolution.
    """
    return ChatGoogleGenerativeAI(
        model=settings.gemini_lite_model if lite else settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=temperature,
        max_retries=2,
        timeout=120,
    )


def invoke_structured(structured, prompt: str, attempts: int = 5):
    """Invoke a structured-output chain with backoff for transient Gemini errors.

    Free-tier quotas are per-minute per-model (e.g. 5 RPM), and Google returns the
    exact retry delay in the error message - we honor it instead of guessing.
    """
    import re

    last: Exception | None = None
    for i in range(attempts):
        try:
            return structured.invoke(prompt)
        except Exception as e:  # noqa: BLE001
            last = e
            msg = str(e)
            transient = any(code in msg for code in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "overloaded"))
            if transient and i < attempts - 1:
                # Honor Google's suggested delay when present ("Please retry in 23.7s")
                m = re.search(r"retry in ([0-9.]+)s", msg)
                wait = float(m.group(1)) + 1.5 if m else min(60.0, 2 ** (i + 1) * 2)
                wait = min(wait, 60.0)
                print(f"[llm] transient error ({msg[:70]}...), retry {i + 1}/{attempts - 1} in {wait:.0f}s", flush=True)
                time.sleep(wait)
                continue
            raise
    raise last  # type: ignore[misc]
