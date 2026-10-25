"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { SUPPORT_EMAIL } from "@/lib/support";
import { adminNav, driverNav, isActive, passengerNav, profileNav, type NavItem } from "./nav";
import { useMode } from "./useMode";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`nav-item ${isActive(pathname, item.href) ? "active" : ""}`}>
      <Icon className="icon" size={20} strokeWidth={1.8} />
      <span>{item.label}</span>
    </Link>
  );
}

// `adminSlot` is filled by the server (with <AdminNavLink />) only for admins.
export function Sidebar({ adminSlot }: { adminSlot: ReactNode }) {
  const pathname = usePathname();
  const mode = useMode();
  const nav = mode === "driver" ? driverNav : passengerNav;

  return (
    <aside className="sidebar">
      <Logo />
      <nav className="side-nav" aria-label="ניווט ראשי">
        <p className="nav-label">{mode === "driver" ? "אזור נהגת" : "אזור טרמפיסטית"}</p>
        {nav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="nav-divider"></div>
        <NavLink item={profileNav} pathname={pathname} />
        {adminSlot}
      </nav>
      <div className="sidebar-help">
        <div className="help-icon">?</div>
        <div>
          <strong>צריכה עזרה?</strong>
          <span>אנחנו כאן בשבילך</span>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </aside>
  );
}

export function AdminNavLink() {
  return <NavLink item={adminNav} pathname={usePathname()} />;
}
