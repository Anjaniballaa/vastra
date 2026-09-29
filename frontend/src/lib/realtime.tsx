"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { wsUrl } from "./api";
import { useAuth } from "./auth";

type Handler = (event: string, data: any) => void;
type Realtime = { subscribe: (h: Handler) => () => void; connected: boolean };

const RealtimeContext = createContext<Realtime | null>(null);

/** One WebSocket per signed-in tab; reconnects with backoff. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const handlers = useRef(new Set<Handler>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl(token));
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ping = setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "pong") return;
          handlers.current.forEach((h) => h(msg.event, msg.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = (e) => {
        setConnected(false);
        clearInterval(ping);
        if (closed || e.code === 4401) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 1000 * 2 ** retry);
      };
    };
    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(timer);
      ws?.close();
    };
  }, [token]);

  const subscribe = (h: Handler) => {
    handlers.current.add(h);
    return () => {
      handlers.current.delete(h);
    };
  };

  return <RealtimeContext.Provider value={{ subscribe, connected }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(handler: Handler, deps: unknown[] = []) {
  const ctx = useContext(RealtimeContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);
  return ctx?.connected ?? false;
}
