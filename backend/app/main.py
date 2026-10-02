import asyncio
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import config, scheduler
from .db import Base, SessionLocal, engine
from .models import STAFF_ROLES, User
from .realtime import hub
from .routers import admin, auth, catalog, catalog_admin, ops, shop, staff, support, twilio_hooks
from .security import hash_secret, user_from_token
from .services import memory

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("vastra")
# the Hindsight client's sync wrapper leaves aiohttp sessions for the GC; that noise isn't actionable
logging.getLogger("asyncio").addFilter(lambda r: not str(r.getMessage()).startswith("Unclosed"))


def bootstrap_admin():
    if not (config.BOOTSTRAP_ADMIN_EMAIL and config.BOOTSTRAP_ADMIN_PASSWORD):
        return
    db = SessionLocal()
    try:
        if db.query(User).filter_by(role="admin").first():
            return
        u = db.query(User).filter_by(email=config.BOOTSTRAP_ADMIN_EMAIL).first()
        if u:
            u.role, u.password_hash = "admin", hash_secret(config.BOOTSTRAP_ADMIN_PASSWORD)
        else:
            db.add(User(email=config.BOOTSTRAP_ADMIN_EMAIL, name=config.BOOTSTRAP_ADMIN_NAME, role="admin",
                        password_hash=hash_secret(config.BOOTSTRAP_ADMIN_PASSWORD)))
        db.commit()
        log.info("bootstrap admin created: %s", config.BOOTSTRAP_ADMIN_EMAIL)
    finally:
        db.close()


# Additive column migrations for tables that already exist (create_all only creates missing tables).
MIGRATIONS = [
    "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pending_action JSON",
]


def init_db(attempts: int = 5):
    for i in range(attempts):
        try:
            Base.metadata.create_all(engine)
            with engine.begin() as conn:
                for stmt in MIGRATIONS:
                    conn.execute(text(stmt))
            bootstrap_admin()
            return
        except Exception as e:  # Neon may be waking from scale-to-zero, or the network blipped
            if i == attempts - 1:
                raise
            log.warning("database not reachable yet (%s), retrying...", e.__class__.__name__)
            import time
            time.sleep(3 * (i + 1))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(init_db)
    hub.attach_loop(asyncio.get_running_loop())
    threading.Thread(target=memory.ensure_playbook, daemon=True).start()
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="Vastra API", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list({config.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"}),
    # Vercel's default/preview URLs, usable before the custom domain is connected
    allow_origin_regex=r"https://vastra[a-z0-9-]*\.vercel\.app",
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
for r in (auth, catalog, shop, support, staff, ops, catalog_admin, admin, twilio_hooks):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    with engine.connect() as c:
        c.execute(text("select 1"))
    return {"ok": True, "env": config.APP_ENV}


@app.websocket("/ws")
async def websocket(ws: WebSocket, token: str):
    db = SessionLocal()
    try:
        user = user_from_token(db, token)
    finally:
        db.close()
    if not user:
        await ws.close(code=4401)
        return
    await hub.connect(ws, user.id, user.role in STAFF_ROLES)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"event":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws, user.id)
