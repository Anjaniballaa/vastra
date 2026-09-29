from sqlalchemy.orm import Session

from ..models import AuditLog, User


def audit(db: Session, actor: User | None, action: str, target: str | None = None, detail: str | None = None):
    db.add(AuditLog(
        actor_id=actor.id if actor else None,
        actor_label=f"{actor.name} ({actor.role})" if actor else "system",
        action=action, target=target, detail=detail,
    ))
