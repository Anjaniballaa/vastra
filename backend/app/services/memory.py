"""Hindsight memory layer.

Banks:
  vastra-cust-{user_id}  one per customer: sizes/fit, past issues, delivery quirks, preferences, mood history.
  vastra-playbook        shared: lessons from resolved tickets, human corrections, incident resolutions.

All calls degrade gracefully: if Hindsight is slow or down, support keeps working without memory.
"""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from hindsight_client import Hindsight

from .. import config

log = logging.getLogger("memory")
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="memory")
_local = threading.local()
_known_banks: set[str] = set()
_bank_lock = threading.Lock()

CUSTOMER_MISSION = (
    "Remember everything about this Vastra fashion-store customer that helps support serve them better next time: "
    "clothing and shoe sizes and how brands fit them, items they returned and why, delivery address quirks, "
    "payment problems, issues they raised and how each was resolved, promises made to them, how they like to be "
    "spoken to, and how frustrated they have been."
)
PLAYBOOK_MISSION = (
    "Vastra customer-support playbook. Learn which fixes resolve which customer problems, the root causes behind "
    "recurring issues, known incidents and how they were resolved, corrections human agents made to AI replies, "
    "and faster ways to resolve similar tickets next time."
)
PLAYBOOK_DIRECTIVES = [
    ("No invented policy", "Never state a policy, timeline or amount that is not in the store policy or a recorded resolution."),
    ("Refund limits", "Refunds above the AI refund limit always need human approval."),
    ("Prefer proven fixes", "When a recorded lesson matches the customer's symptom, suggest that fix first."),
]


def _client() -> Hindsight | None:
    if not config.HINDSIGHT_API_KEY:
        return None
    c = getattr(_local, "client", None)
    if c is None:
        c = Hindsight(base_url=config.HINDSIGHT_API_URL, api_key=config.HINDSIGHT_API_KEY, timeout=30, max_attempts=2)
        _local.client = c
    return c


def in_background(fn, *args, **kwargs):
    """Run a memory write off the request path."""
    _pool.submit(fn, *args, **kwargs)


def customer_bank(user_id: int) -> str:
    return f"{config.CUSTOMER_BANK_PREFIX}{user_id}"


def _ensure_bank(bank_id: str, name: str, mission: str, directives=None):
    if bank_id in _known_banks:
        return
    c = _client()
    if not c:
        return
    with _bank_lock:
        if bank_id in _known_banks:
            return
        try:
            c.get_bank_config(bank_id)
        except Exception:
            try:
                c.create_bank(bank_id, name=name, mission=mission, enable_observations=True)
                for dname, content in directives or []:
                    c.create_directive(bank_id, name=dname, content=content)
            except Exception as e:
                log.warning("create bank %s failed: %s", bank_id, e)
                return
        _known_banks.add(bank_id)


def ensure_playbook():
    _ensure_bank(config.PLAYBOOK_BANK, "Vastra support playbook", PLAYBOOK_MISSION, PLAYBOOK_DIRECTIVES)
    c = _client()
    if not c:
        return
    try:
        models = c.list_mental_models(config.PLAYBOOK_BANK)
        items = getattr(models, "items", None) or getattr(models, "mental_models", None) or []
        if not any(getattr(m, "id", None) == "known-issues" for m in items):
            c.create_mental_model(
                config.PLAYBOOK_BANK, name="Known issues & proven fixes",
                source_query="List the recurring customer problems seen at Vastra, their root causes and the fix that worked for each.",
                id="known-issues", max_tokens=1200,
            )
    except Exception as e:
        log.info("mental model setup skipped: %s", e)


def ensure_customer(user_id: int, name: str = ""):
    _ensure_bank(customer_bank(user_id), f"Customer {user_id} {name}".strip(), CUSTOMER_MISSION)


def _results(resp) -> list[dict]:
    out = []
    for r in getattr(resp, "results", None) or []:
        out.append({
            "id": r.id, "text": r.text, "type": r.type,
            "when": r.mentioned_at.isoformat() if getattr(r, "mentioned_at", None) and hasattr(r.mentioned_at, "isoformat") else r.mentioned_at,
            "score": (r.scores or {}).get("final") if isinstance(getattr(r, "scores", None), dict) else None,
            "tags": r.tags or [],
        })
    return out


def retain_customer(user_id: int, text: str, context: str, tags: list[str] | None = None, name: str = ""):
    c = _client()
    if not c:
        return False
    try:
        ensure_customer(user_id, name)
        c.retain(customer_bank(user_id), text, context=context, timestamp=datetime.now(timezone.utc),
                 tags=tags or [], retain_async=True)
        return True
    except Exception as e:
        log.warning("retain customer %s failed: %s", user_id, e)
        return False


def recall_customer(user_id: int, query: str, max_tokens: int = 1500) -> list[dict]:
    c = _client()
    if not c:
        return []
    try:
        ensure_customer(user_id)
        return _results(c.recall(customer_bank(user_id), query, budget="low", max_tokens=max_tokens))
    except Exception as e:
        log.warning("recall customer %s failed: %s", user_id, e)
        return []


def retain_playbook(text: str, context: str, tags: list[str] | None = None):
    c = _client()
    if not c:
        return False
    try:
        ensure_playbook()
        c.retain(config.PLAYBOOK_BANK, text, context=context, timestamp=datetime.now(timezone.utc),
                 tags=tags or [], retain_async=True)
        return True
    except Exception as e:
        log.warning("retain playbook failed: %s", e)
        return False


def recall_playbook(query: str, max_tokens: int = 1500) -> list[dict]:
    c = _client()
    if not c:
        return []
    try:
        ensure_playbook()
        return _results(c.recall(config.PLAYBOOK_BANK, query, budget="low", max_tokens=max_tokens))
    except Exception as e:
        log.warning("recall playbook failed: %s", e)
        return []


def reflect_customer(user_id: int, question: str) -> str:
    c = _client()
    if not c:
        return ""
    try:
        ensure_customer(user_id)
        return c.reflect(customer_bank(user_id), question, budget="low").text or ""
    except Exception as e:
        log.warning("reflect customer %s failed: %s", user_id, e)
        return ""


def list_memories(bank_id: str, limit: int = 50) -> list[dict]:
    c = _client()
    if not c:
        return []
    try:
        resp = c.list_memories(bank_id, limit=limit)
        items = getattr(resp, "items", None) or []
        out = []
        for m in items:
            d = m.to_dict() if hasattr(m, "to_dict") else dict(m)
            out.append({"id": d.get("id"), "text": d.get("text"), "type": d.get("fact_type") or d.get("type"),
                        "when": d.get("mentioned_at") or d.get("date") or d.get("created_at"),
                        "context": d.get("context"), "tags": d.get("tags") or []})
        return out
    except Exception as e:
        log.warning("list memories %s failed: %s", bank_id, e)
        return []


def known_issues_model() -> str:
    c = _client()
    if not c:
        return ""
    try:
        m = c.get_mental_model(config.PLAYBOOK_BANK, "known-issues", detail="content")
        d = m.to_dict() if hasattr(m, "to_dict") else {}
        return d.get("content") or ""
    except Exception:
        return ""


def refresh_known_issues():
    c = _client()
    if not c:
        return
    try:
        c.refresh_mental_model(config.PLAYBOOK_BANK, "known-issues")
    except Exception as e:
        log.info("refresh mental model skipped: %s", e)
