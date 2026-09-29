import { ConsoleShell } from "@/components/console/ConsoleShell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell roles={["agent", "lead", "ops", "catalog"]}>{children}</ConsoleShell>;
}
