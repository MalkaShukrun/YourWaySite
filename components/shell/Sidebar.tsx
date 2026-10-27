"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { iconProps } from "@/components/ui/icon";
import { adminNavItem, driverNavItems, isNavItemActive, passengerNavItems, profileNavItem, type NavItem } from "./nav";
import { useMode } from "./useMode";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`nav-item ${isNavItemActive(pathname, item.href) ? "active" : ""}`}>
      <Icon {...iconProps} size={20} />
      <span>{item.label}</span>
    </Link>
  );
}

// `adminSlot` is filled by the server (with <AdminNavLink />) only for admins.
export function Sidebar({ adminSlot }: { adminSlot: ReactNode }) {
  const pathname = usePathname();
  const mode = useMode();
  const items = mode === "driver" ? driverNavItems : passengerNavItems;

  return (
    <aside className="sidebar">
      <Logo />
      <nav className="side-nav" aria-label="ניווט ראשי">
        <p className="nav-label">{mode === "driver" ? "אזור נהגת" : "אזור טרמפיסטית"}</p>
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="nav-divider"></div>
        <NavLink item={profileNavItem} pathname={pathname} />
        {adminSlot}
      </nav>
    </aside>
  );
}

export function AdminNavLink() {
  return <NavLink item={adminNavItem} pathname={usePathname()} />;
}
