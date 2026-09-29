"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input, PageLoader } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const next = params.get("next") || "/";

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await api("/api/auth/otp/request", { method: "POST", body: { email } });
      setIsNew(r.is_new_user);
      setDevCode(r.dev_code ?? null);
      setStep("code");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await api("/api/auth/otp/verify", { method: "POST", body: { email, code, name: isNew ? name : undefined, phone: isNew ? phone : undefined } });
      signIn(r.token, r.user);
      router.replace(next);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-brand-900/5 ring-1 ring-line">
        {step === "email" ? (
          <form onSubmit={requestCode} className="space-y-5">
            <div>
              <h1 className="text-2xl font-extrabold">Login or sign up</h1>
              <p className="mt-1 text-sm text-muted">We&apos;ll email you a one-time code. No passwords.</p>
            </div>
            <Input label="Email address" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              <Mail size={16} /> Send code
            </Button>
            <p className="text-center text-xs text-muted">
              Vastra staff? <Link href="/staff/login" className="font-bold text-brand-700">Sign in here</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <button type="button" onClick={() => setStep("email")} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
              <ArrowLeft size={14} /> {email}
            </button>
            <div>
              <h1 className="text-2xl font-extrabold">{isNew ? "Create your account" : "Enter the code"}</h1>
              <p className="mt-1 text-sm text-muted">We sent a 6-digit code to {email}.</p>
              {devCode && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                  Email isn&apos;t configured on this development server, so your code is: <b className="tracking-widest">{devCode}</b>
                </p>
              )}
            </div>
            <Input label="Code" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center text-lg tracking-[0.5em]" />
            {isNew && (
              <>
                <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
                <Input
                  label="Mobile number"
                  required
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  hint="Order updates and support replies on WhatsApp"
                />
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {isNew ? "Create account" : "Verify & continue"}
            </Button>
            <button type="button" onClick={() => requestCode()} className="w-full text-center text-xs font-bold text-brand-700">
              Resend code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
