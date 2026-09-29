"""Groq LLM access with retries for rate limits and malformed tool calls."""
import json
import logging
import re
import time

import groq

from .. import config

log = logging.getLogger("llm")
_client: groq.Groq | None = None


class LLMUnavailable(Exception):
    pass


def client() -> groq.Groq:
    global _client
    if _client is None:
        if not config.GROQ_API_KEY:
            raise LLMUnavailable("GROQ_API_KEY missing")
        _client = groq.Groq(api_key=config.GROQ_API_KEY, timeout=45, max_retries=0)
    return _client


def chat(messages: list[dict], *, tools: list[dict] | None = None, model: str | None = None,
         json_mode: bool = False, temperature: float = 0.3, max_tokens: int = 1200):
    """Returns the assistant message object. Retries rate limits and tool-call format errors."""
    model = model or config.GROQ_MODEL_MAIN
    kwargs = {"model": model, "messages": messages, "temperature": temperature, "max_completion_tokens": max_tokens}
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    last_err = None
    for attempt in range(4):
        try:
            resp = client().chat.completions.create(**kwargs)
            return resp.choices[0].message
        except groq.RateLimitError as e:
            last_err = e
            retry_after = _retry_after(e)
            if kwargs["model"] != config.GROQ_MODEL_FAST and (attempt >= 1 or retry_after > 8):
                # the big model's per-minute budget is spent: answer with the fast model instead of making the customer wait
                log.warning("groq %s rate limited; falling back to %s", kwargs["model"], config.GROQ_MODEL_FAST)
                kwargs["model"] = config.GROQ_MODEL_FAST
                continue
            wait = min(max(retry_after, 1.5 * (attempt + 1)), 15)
            log.warning("groq rate limited, retrying in %.1fs", wait)
            time.sleep(wait)
        except groq.BadRequestError as e:
            last_err = e
            text = str(e)
            if "tool_use_failed" in text or "tool call validation" in text.lower():
                log.warning("tool call failed validation, retrying (%s)", attempt)
                kwargs["temperature"] = 0.1
                continue
            if json_mode and "json_validate_failed" in text:
                continue
            raise LLMUnavailable(text) from e
        except (groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise LLMUnavailable(str(last_err))


def _retry_after(err: Exception) -> float:
    try:
        return float(err.response.headers.get("retry-after", 0))  # type: ignore[attr-defined]
    except Exception:
        return 0.0


def complete_json(system: str, user: str, *, model: str | None = None, max_tokens: int = 800) -> dict:
    msg = chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
               model=model or config.GROQ_MODEL_FAST, json_mode=True, temperature=0.1, max_tokens=max_tokens)
    return parse_json(msg.content or "{}")


def parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {}
