"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

export type Role = "customer" | "agent" | "lead" | "ops" | "catalog" | "admin";
export type User = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  loyalty_points: number;
  whatsapp_opt_in: boolean;
  created_at: string;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export const STAFF_HOME: Record<Role, string> = {
  customer: "/",
  agent: "/console",
  lead: "/console",
  ops: "/ops",
  catalog: "/catalog",
  admin: "/admin",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = getToken();
    setTok(t);
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/api/auth/me"));
    } catch {
      setToken(null);
      setTok(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = (t: string, u: User) => {
    setToken(t);
    setTok(t);
    setUser(u);
  };
  const signOut = () => {
    setToken(null);
    setTok(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
