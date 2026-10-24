import { AppShell } from "@/components/shell/AppShell";

export default function PassengerLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
