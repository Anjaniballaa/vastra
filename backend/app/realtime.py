"""In-process WebSocket hub. Safe to call `publish` from worker threads."""
import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

log = logging.getLogger("realtime")


class Hub:
    def __init__(self):
        self.loop: asyncio.AbstractEventLoop | None = None
        self.by_user: dict[int, set[WebSocket]] = defaultdict(set)
        self.staff: set[WebSocket] = set()

    def attach_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def connect(self, ws: WebSocket, user_id: int, is_staff: bool):
        await ws.accept()
        self.by_user[user_id].add(ws)
        if is_staff:
            self.staff.add(ws)

    def disconnect(self, ws: WebSocket, user_id: int):
        self.by_user[user_id].discard(ws)
        self.staff.discard(ws)

    async def _send(self, targets: list[WebSocket], payload: str):
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                self.staff.discard(ws)
                for conns in self.by_user.values():
                    conns.discard(ws)

    def _dispatch(self, targets: list[WebSocket], event: str, data: dict):
        if not targets or not self.loop:
            return
        payload = json.dumps({"event": event, "data": data}, default=str)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self._send(targets, payload))
        else:
            asyncio.run_coroutine_threadsafe(self._send(targets, payload), self.loop)

    def to_staff(self, event: str, data: dict):
        self._dispatch(list(self.staff), event, data)

    def to_user(self, user_id: int, event: str, data: dict):
        self._dispatch(list(self.by_user.get(user_id, ())), event, data)


hub = Hub()
