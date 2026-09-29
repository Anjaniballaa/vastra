"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { STAFF_HOME, useAuth } from "@/lib/auth";
import { Button, Input } from "@/components/ui";
import { Logo } from "@/components/store/Logo";

export default function StaffLogin() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await api("/api/auth/staff/login", { method: "POST", body: { email, password } });
      signIn(r.token, r.user);
      router.replace(STAFF_HOME[r.user.role as keyof typeof STAFF_HOME]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-900 to-brand-700 p-12 text-white lg:flex">
        <Logo light />
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight">Vastra Care console</h1>
          <p className="mt-4 max-w-md text-brand-100">
            Every ticket arrives with the customer&apos;s full memory. New issues come straight to you. Repeated issues become incidents automatically — and the on-call phone rings.
          </p>
        </div>
        <p className="text-xs text-brand-200">Support · Operations · Catalog · Admin</p>
      </div>
      <div className="flex items-center justify-center px-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-extrabold">
              <ShieldCheck className="text-brand-600" /> Staff sign in
            </h2>
            <p className="mt-1 text-sm text-muted">Accounts are created by your Vastra administrator.</p>
          </div>
          <Input label="Work email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Sign in
          </Button>
          <p className="text-center text-xs text-muted">
            Shopping? <Link href="/login" className="font-bold text-brand-700">Customer login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
