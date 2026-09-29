"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, BellRing, Siren, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { alertBeep, chime, primeAudio, sirenCycle } from "@/lib/sound";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

type Incident = {
  id: number;
  code: string;
  title: string;
  severity: "new" | "sev3" | "sev2" | "sev1";
  severity_label: string;
  status: string;
  customer_count: number;
  category: string;
  last_seen: string;
  oncall: string | null;
};

/** Live alarms for the whole staff console: Sev 1 = full-screen siren, Sev 2 = pulsing banner, Sev 3 = banner. */
export function IncidentAlarm() {
  const { user } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const [active, setActive] = useState<Incident[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const [acking, setAcking] = useState<number | null>(null);
  const sirenTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const load = useCallback(async () => {
    const r = await api("/api/staff/incidents", { query: { status: "active" } });
    setActive(r.items.filter((i: Incident) => i.severity !== "new"));
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const unlock = () => {
      primeAudio();
      setSoundOn(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [load]);

  useRealtime(
    (event, data) => {
      if (event === "incident.escalated") {
        load();
        if (data.severity === "sev2") alertBeep();
        if (data.severity === "sev3") chime();
        toast.error(`${data.severity_label}: ${data.title} (${data.customer_count} customers)`);
      } else if (event === "incident.updated") {
        load();
      } else if (event === "ticket.handoff" && ["agent", "lead", "admin"].includes(user?.role ?? "")) {
        chime();
        toast.info(`${data.new_issue ? "New issue" : "Handoff"}: ${data.code}`);
      }
    },
    [load, user?.role],
  );

  const sev1 = active.filter((i) => i.severity === "sev1" && i.status === "open");
  const banners = active.filter((i) => (i.severity === "sev2" || i.severity === "sev3") && i.status === "open");

  useEffect(() => {
    clearInterval(sirenTimer.current);
    if (sev1.length && soundOn) {
      sirenCycle();
      sirenTimer.current = setInterval(sirenCycle, 2600);
    }
    return () => clearInterval(sirenTimer.current);
  }, [sev1.length, soundOn]);

  const ack = async (id: number) => {
    setAcking(id);
    try {
      await api(`/api/staff/incidents/${id}/ack`, { method: "POST" });
      await load();
      toast.success("Acknowledged — you own this incident");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAcking(null);
    }
  };

  return (
    <>
      {banners.map((i) => (
        <div key={i.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-white ${i.severity === "sev2" ? "animate-pulse bg-red-600" : "bg-amber-500"}`}>
          <span className="flex items-center gap-2">
            {i.severity === "sev2" ? <BellRing size={16} /> : <AlertTriangle size={16} />}
            {i.severity_label} · {i.code} · {i.title} — {i.customer_count} customers · last report {ago(i.last_seen)}
          </span>
          <span className="flex gap-2">
            <Link href={`/console/incidents/${i.id}`} className="rounded bg-white/20 px-3 py-1 hover:bg-white/30">Open</Link>
            <button onClick={() => ack(i.id)} disabled={acking === i.id} className="rounded bg-white px-3 py-1 text-ink hover:bg-white/90">
              Acknowledge
            </button>
          </span>
        </div>
      ))}
      {sev1.length > 0 && !pathname.startsWith(`/console/incidents/${sev1[0].id}`) && (
        <div className="fixed inset-0 z-[90] flex animate-siren items-center justify-center p-6 text-white">
          <div className="w-full max-w-2xl text-center">
            <Siren size={72} className="mx-auto animate-bounce" />
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.4em]">Severity 1 incident</p>
            {sev1.map((i) => (
              <div key={i.id} className="mt-6 rounded-2xl bg-black/25 p-6 text-left">
                <p className="font-mono text-sm opacity-80">{i.code} · {i.category}</p>
                <h2 className="mt-1 text-3xl font-extrabold">{i.title}</h2>
                <p className="mt-2 text-lg">{i.customer_count} customers affected · last report {ago(i.last_seen)}</p>
                <p className="mt-1 text-sm opacity-80">On call: {i.oncall ?? "—"} · escalates automatically if nobody acknowledges</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button size="lg" variant="dark" loading={acking === i.id} onClick={() => ack(i.id)}>
                    I&apos;m on it — acknowledge
                  </Button>
                  <Link href={`/console/incidents/${i.id}`}>
                    <Button size="lg" variant="outline">View details</Button>
                  </Link>
                </div>
              </div>
            ))}
            {!soundOn && (
              <button onClick={() => { primeAudio(); setSoundOn(true); }} className="mt-5 inline-flex items-center gap-2 text-sm underline">
                <Volume2 size={16} /> Enable siren sound
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
