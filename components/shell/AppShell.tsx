import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { initialsOf } from "@/lib/format";
import { AdminNavLink, Sidebar } from "./Sidebar";
import { Header, UserMenu } from "./Header";
import { BottomNav } from "./BottomNav";

// The signed-in layout from the design: sidebar, top bar, mobile tab bar.
// Menus read the URL and the user, so they stream in behind <Suspense>;
// pages do their own auth checks (requireUser / requireAdmin).
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Suspense fallback={<aside className="sidebar" />}>
        <Sidebar
          adminSlot={
            <Suspense fallback={null}>
              <AdminOnly><AdminNavLink /></AdminOnly>
            </Suspense>
          }
        />
      </Suspense>
      <div className="main-shell">
        <Suspense fallback={<header className="topbar" />}>
          <Header
            userSlot={
              <Suspense fallback={null}>
                <CurrentUserMenu />
              </Suspense>
            }
          />
        </Suspense>
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomNavForUser />
      </Suspense>
    </div>
  );
}

async function AdminOnly({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return user?.isAdmin ? children : null;
}

async function CurrentUserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <UserMenu name={user.fullName} initials={initialsOf(user.fullName)} />;
}

async function BottomNavForUser() {
  const user = await getCurrentUser();
  return <BottomNav isAdmin={Boolean(user?.isAdmin)} />;
}
