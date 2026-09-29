"""Customer-facing support: chat with Vastra Care, see your tickets, rate them."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Ticket, User
from ..realtime import hub
from ..security import current_user
from ..services import agent, memory

router = APIRouter(prefix="/api/support", tags=["support"])

STATUS_TEXT = {"ai_active": "Open", "needs_human": "With our specialist team", "human_active": "With a support agent",
               "waiting_customer": "Awaiting your reply", "resolved": "Resolved", "closed": "Closed"}


def ticket_out(t: Ticket, with_messages: bool = False) -> dict:
    d = {"id": t.id, "code": t.code, "subject": t.subject, "status": t.status, "status_text": STATUS_TEXT.get(t.status),
         "channel": t.channel, "created_at": t.created_at, "updated_at": t.updated_at, "csat": t.csat,
         "order_id": t.order_id, "agent": t.assignee.name.split()[0] if t.assignee and t.human_turns else None}
    if with_messages:
        d["messages"] = [{"id": m.id, "sender": m.sender, "body": m.body, "at": m.created_at, "channel": m.channel,
                          "author": (m.author.name.split()[0] if m.author else None)}
                         for m in t.messages if not m.is_internal and not m.is_draft]
    return d


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    ticket_id: int | None = None
    order_code: str | None = None


@router.post("/chat")
def chat(body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "customer":
        raise HTTPException(400, "Staff accounts can't open customer tickets")
    ticket = None
    if body.ticket_id:
        ticket = db.query(Ticket).filter_by(id=body.ticket_id, customer_id=user.id).first()
        if not ticket:
            raise HTTPException(404, "Ticket not found")
    ticket, _ = agent.handle_customer_message(db, user, body.message, "web", ticket, body.order_code)
    db.refresh(ticket)
    return ticket_out(ticket, with_messages=True)


@router.get("/tickets")
def my_tickets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Ticket).filter_by(customer_id=user.id).order_by(Ticket.updated_at.desc()).limit(50).all()
    return {"items": [ticket_out(t) for t in rows]}


@router.get("/tickets/{tid}")
def my_ticket(tid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter_by(id=tid, customer_id=user.id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    return ticket_out(t, with_messages=True)


class CsatIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


@router.post("/tickets/{tid}/csat")
def rate(tid: int, body: CsatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter_by(id=tid, customer_id=user.id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    t.csat = body.rating
    db.commit()
    hub.to_staff("ticket.updated", {"id": t.id})
    memory.in_background(memory.retain_customer, user.id,
                         f"{user.name} rated support ticket {t.code} {body.rating}/5. {body.comment or ''}",
                         "support rating", ["csat"], user.name)
    return ticket_out(t)
