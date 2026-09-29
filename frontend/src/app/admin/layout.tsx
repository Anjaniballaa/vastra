import { ConsoleShell } from "@/components/console/ConsoleShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell roles={["admin", "lead"]}>{children}</ConsoleShell>;
}
