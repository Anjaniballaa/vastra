import { ConsoleShell } from "@/components/console/ConsoleShell";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell roles={["ops", "lead"]}>{children}</ConsoleShell>;
}
