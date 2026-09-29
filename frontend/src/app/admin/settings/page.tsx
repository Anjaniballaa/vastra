"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, CircleSlash, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input, PageLoader, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";
import { SevChip } from "@/components/console/bits";

export default function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api("/api/admin/settings").then(setS);
    api("/api/admin/users").then((r) => setStaff(r.items.filter((u: any) => ["lead", "admin", "agent"].includes(u.role) && u.is_active)));
    api("/api/admin/integrations").then(setIntegrations);
  }, [user]);

  if (user?.role !== "admin") return <p className="p-10 text-center text-muted">Admins only.</p>;
  if (!s) return <PageLoader />;

  const save = async (key: string) => {
    try {
      setS({ ...s, [key]: await api(`/api/admin/settings/${key}`, { method: "PUT", body: s[key] }) });
      toast.success("Saved — takes effect immediately");
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const setRule = (sev: string, k: string, v: number) => setS({ ...s, severity_rules: { ...s.severity_rules, [sev]: { ...s.severity_rules[sev], [k]: v } } });
  const oncallIds: number[] = s.oncall.user_ids?.length ? s.oncall.user_ids : staff.filter((u) => ["lead", "admin"].includes(u.role)).map((u) => u.id);
  const moveOncall = (idx: number, dir: -1 | 1) => {
    const ids = [...oncallIds];
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    setS({ ...s, oncall: { user_ids: ids } });
  };

  return (
    <div>
      <PageHeader title="Alerting & policies" subtitle="Thresholds, on-call rotation, AI limits and store policies — all read live by the agent and incident engine." />
      <div className="grid gap-6 p-6 xl:grid-cols-2">
        <Card title="Severity thresholds" onSave={() => save("severity_rules")} hint="Distinct customers reporting the same new issue within the window. Lower them for a live demo.">
          {(["sev3", "sev2", "sev1"] as const).map((sev) => (
            <div key={sev} className="flex items-end gap-3">
              <div className="w-20 pb-2"><SevChip severity={sev} label={sev.replace("sev", "Sev ")} /></div>
              <Input label="Customers" type="number" min={1} value={s.severity_rules[sev].customers} onChange={(e) => setRule(sev, "customers", Number(e.target.value))} />
              <Input label="Within (minutes)" type="number" min={1} value={s.severity_rules[sev].window_minutes} onChange={(e) => setRule(sev, "window_minutes", Number(e.target.value))} />
            </div>
          ))}
          <div className="flex items-end gap-3 rounded-lg bg-red-50 p-3">
            <div className="w-20 pb-2 text-xs font-bold text-red-700">Sev 1 fast-track</div>
            <Input label="Payment/security reports" type="number" min={1} value={s.severity_rules.sev1_critical.customers} onChange={(e) => setRule("sev1_critical", "customers", Number(e.target.value))} />
            <Input label="Within (minutes)" type="number" min={1} value={s.severity_rules.sev1_critical.window_minutes} onChange={(e) => setRule("sev1_critical", "window_minutes", Number(e.target.value))} />
          </div>
        </Card>

        <Card title="Re-alerting & escalation" onSave={() => save("alerting")} hint="Un-acknowledged incidents keep alerting. Sev 1 walks down the on-call list.">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Sev 2 repeat (min)" type="number" value={s.alerting.sev2_repeat_minutes} onChange={(e) => setS({ ...s, alerting: { ...s.alerting, sev2_repeat_minutes: Number(e.target.value) } })} />
            <Input label="Sev 1 repeat (min)" type="number" value={s.alerting.sev1_repeat_minutes} onChange={(e) => setS({ ...s, alerting: { ...s.alerting, sev1_repeat_minutes: Number(e.target.value) } })} />
            <Input label="Sev 1 escalate after (min)" type="number" value={s.alerting.sev1_escalate_after_minutes} onChange={(e) => setS({ ...s, alerting: { ...s.alerting, sev1_escalate_after_minutes: Number(e.target.value) } })} />
          </div>
        </Card>

        <Card title="On-call order" onSave={() => save("oncall")} hint="First person is paged first; escalations move down the list.">
          {oncallIds.map((id, i) => {
            const u = staff.find((x) => x.id === id);
            if (!u) return null;
            return (
              <div key={id} className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted">{i + 1}</span>
                <span className="flex-1 font-semibold">{u.name} <span className="text-xs font-normal text-muted">· {u.role} · {u.phone || "no phone"}</span></span>
                <button onClick={() => moveOncall(i, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
                <button onClick={() => moveOncall(i, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
                <button onClick={() => setS({ ...s, oncall: { user_ids: oncallIds.filter((x) => x !== id) } })} className="text-xs text-red-600">remove</button>
              </div>
            );
          })}
          <select
            className="h-9 rounded-md border border-line px-2 text-sm"
            value=""
            onChange={(e) => e.target.value && setS({ ...s, oncall: { user_ids: [...oncallIds, Number(e.target.value)] } })}
          >
            <option value="">+ Add someone to the rotation</option>
            {staff.filter((u) => !oncallIds.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </Card>

        <Card title="AI support limits" onSave={() => save("support")}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="AI can refund up to (₹)" type="number" value={s.support.ai_refund_limit} onChange={(e) => setS({ ...s, support: { ...s.support, ai_refund_limit: Number(e.target.value) } })} />
            <Input label="Hand off at frustration (1–5)" type="number" min={1} max={5} value={s.support.handoff_frustration} onChange={(e) => setS({ ...s, support: { ...s.support, handoff_frustration: Number(e.target.value) } })} />
            <Input label="Follow-up after (hours)" type="number" value={s.support.followup_after_hours} onChange={(e) => setS({ ...s, support: { ...s.support, followup_after_hours: Number(e.target.value) } })} />
            <Input label="Auto-close quiet tickets (hours)" type="number" value={s.support.auto_close_waiting_hours} onChange={(e) => setS({ ...s, support: { ...s.support, auto_close_waiting_hours: Number(e.target.value) } })} />
          </div>
        </Card>

        {integrations && (
          <Card title="Integrations">
            <Row ok={integrations.hindsight.configured} label="Hindsight memory" detail={`playbook bank: ${integrations.hindsight.playbook_bank}`} />
            <Row ok label="Groq LLM" detail={`${integrations.llm.main} · ${integrations.llm.fast}`} />
            <Row ok={integrations.email.configured} label={`Email (${integrations.email.provider})`} detail={integrations.email.inbox ? "sending + reading replies" : "inbox reading not configured"} action={<TestBtn channel="email" />} />
            <Row ok={integrations.whatsapp.configured} label="WhatsApp (Twilio sandbox)" detail={`inbound webhook: ${integrations.whatsapp.inbound_webhook}`} action={<TestBtn channel="whatsapp" />} />
            <Row ok={integrations.voice.enabled} label="Sev 1 voice calls" detail={integrations.voice.enabled ? integrations.voice.number : "set TWILIO_VOICE_ENABLED=true after upgrading Twilio"} />
            <Row ok label="Razorpay" detail={`${integrations.payments.razorpay_mode} mode`} />
          </Card>
        )}

        <Card title="Store policies (the AI quotes these)" onSave={() => save("policies")} wide>
          {Object.entries(s.policies).map(([k, v]: any) => (
            <Textarea key={k} label={k.replace(/_/g, " ")} rows={2} value={v} onChange={(e) => setS({ ...s, policies: { ...s.policies, [k]: e.target.value } })} />
          ))}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, hint, onSave, children, wide }: { title: string; hint?: string; onSave?: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`space-y-3 rounded-xl bg-white p-5 ring-1 ring-line ${wide ? "xl:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-extrabold">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        {onSave && <Button size="sm" onClick={onSave}>Save</Button>}
      </div>
      {children}
    </section>
  );
}

function Row({ ok, label, detail, action }: { ok: boolean; label: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {ok ? <CheckCircle2 size={17} className="text-emerald-600" /> : <CircleSlash size={17} className="text-amber-500" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{label}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
      {action}
    </div>
  );
}

function TestBtn({ channel }: { channel: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/admin/test-notification", { method: "POST", body: { channel } });
          toast.success(`Test ${channel} sent — check the notification log`);
        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Send size={13} /> Test
    </Button>
  );
}
