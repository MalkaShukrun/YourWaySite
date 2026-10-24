import { AppShell } from "@/components/shell/AppShell";

export default function DriverLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
