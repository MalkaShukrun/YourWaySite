import { AppShell } from "@/components/shell/AppShell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AppShell>{children}</AppShell>;
}
