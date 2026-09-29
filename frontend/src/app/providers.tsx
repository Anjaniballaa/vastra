"use client";

import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth";
import { RealtimeProvider } from "@/lib/realtime";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>{children}</RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
