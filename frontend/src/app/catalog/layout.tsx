import { ConsoleShell } from "@/components/console/ConsoleShell";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell roles={["catalog"]}>{children}</ConsoleShell>;
}
