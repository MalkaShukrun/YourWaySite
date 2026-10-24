import { AppShell } from "@/components/shell/AppShell";

export default function ProfileLayout({ children }: LayoutProps<"/profile">) {
  return <AppShell>{children}</AppShell>;
}
