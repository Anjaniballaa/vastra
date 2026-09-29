"""The hindsight loop: when a ticket closes, look back at it and write down what worked (and what would have been faster)."""
import logging
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

from ..db import session_scope
from ..models import Lesson, Ticket
from ..realtime import hub
from . import llm, memory

log = logging.getLogger("lessons")
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="lessons")

LESSON_SYSTEM = """You review a closed customer-support ticket from Vastra (Indian online fashion store) and extract a reusable lesson for future tickets. Output JSON only:
{"reusable": bool,            // false for chit-chat, one-off or unresolved conversations
 "category": "payment|delivery|product|coupon|refund|account|app|order|security|other",
 "symptom": "how customers describe the problem, in general terms (no names/order codes)",
 "cause": "root cause if known, else ''",
 "fix": "the concrete steps/actions that resolved it",
 "faster_path": "how the next similar ticket could be solved in fewer messages (what to check or do first)",
 "turns_to_resolve": int}"""


def write_lesson(ticket_id: int):
    with session_scope() as db:
        t = db.get(Ticket, ticket_id)
        if not t or db.query(Lesson).filter_by(ticket_id=t.id, kind="resolution").first():
            return
        convo = "\n".join(f"{m.sender}: {m.body}" for m in t.messages if not m.is_draft)
        tools = [c["tool"] for m in t.messages for c in (m.meta or {}).get("tools", []) if isinstance(c, dict)]
        prompt = (f"Ticket {t.code} category={t.category} resolved_by={t.resolved_by} "
                  f"resolution_note={t.resolution_note!r} tools_used={tools}\n\nTRANSCRIPT:\n{convo[:9000]}")
        try:
            r = llm.complete_json(LESSON_SYSTEM, prompt, max_tokens=700)
        except llm.LLMUnavailable as e:
            log.warning("lesson for %s skipped: %s", t.code, e)
            return
        if not r.get("reusable") or not r.get("fix"):
            return
        lesson = Lesson(ticket_id=t.id, kind="resolution", category=r.get("category") or t.category,
                        symptom=r.get("symptom", "")[:2000], cause=r.get("cause"), fix=r.get("fix", ""),
                        faster_path=r.get("faster_path"),
                        turns=int(r.get("turns_to_resolve") or (t.ai_turns + t.human_turns)))
        db.add(lesson)
        db.flush()
        text = (f"Lesson from ticket {t.code} ({lesson.category}), resolved by {'the AI' if t.resolved_by == 'ai' else 'a human agent'} "
                f"in {lesson.turns} replies. Symptom: {lesson.symptom}. Root cause: {lesson.cause or 'unknown'}. "
                f"Fix that worked: {lesson.fix}. Faster next time: {lesson.faster_path or '-'}.")
        lesson.retained = memory.retain_playbook(text, "resolved ticket lesson", ["lesson", lesson.category or "other"])
        hub.to_staff("lesson.created", {"id": lesson.id, "ticket": t.code, "symptom": lesson.symptom})
    memory.refresh_known_issues()


def write_lesson_async(ticket_id: int):
    _pool.submit(write_lesson, ticket_id)


def record_correction_async(ticket_id: int, draft: str, human_reply: str, agent_name: str):
    """If a human materially changed the AI's suggested reply, learn from the difference."""
    if SequenceMatcher(None, draft.lower(), human_reply.lower()).ratio() > 0.8:
        return

    def _do():
        with session_scope() as db:
            t = db.get(Ticket, ticket_id)
            if not t:
                return
            last_customer = next((m.body for m in reversed(t.messages) if m.sender == "customer"), "")
            try:
                r = llm.complete_json(
                    'Compare an AI draft with what a human support agent actually sent. Output JSON: '
                    '{"lesson":"one or two sentences telling the AI what to do differently in this kind of situation", '
                    '"category":"payment|delivery|product|coupon|refund|account|app|order|security|other"}',
                    f"Customer: {last_customer}\n\nAI draft: {draft}\n\nHuman sent: {human_reply}", max_tokens=300)
            except llm.LLMUnavailable:
                return
            if not r.get("lesson"):
                return
            lesson = Lesson(ticket_id=t.id, kind="correction", category=r.get("category"), symptom=last_customer[:1000],
                            fix=r["lesson"], cause=f"Corrected by {agent_name}")
            db.add(lesson)
            db.flush()
            lesson.retained = memory.retain_playbook(
                f"Human correction on ticket {t.code}: when a customer says something like \"{last_customer[:300]}\", "
                f"{r['lesson']} (AI had drafted: \"{draft[:300]}\"; {agent_name} sent: \"{human_reply[:300]}\")",
                "human agent correction", ["correction", r.get("category") or "other"])
            hub.to_staff("lesson.created", {"id": lesson.id, "ticket": t.code, "symptom": lesson.symptom})

    _pool.submit(_do)
