"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Check, Home, Route, Search, Settings, User } from "lucide-react";
import { isActive, modeFor } from "./nav";

const passengerItems = [
  { href: "/", label: "חיפוש", icon: Search },
  { href: "/my-rides", label: "נסיעות", icon: CalendarDays },
  { href: "/payments", label: "תשלומים", icon: Check },
  { href: "/profile", label: "פרופיל", icon: User },
];

const driverItems = [
  { href: "/dashboard", label: "היום", icon: Home },
  { href: "/routes", label: "מסלולים", icon: Route },
  { href: "/admin/groups", label: "קבוצות", icon: Settings },
  { href: "/profile", label: "פרופיל", icon: User },
];

// Mobile-only tab bar (hidden on desktop by the design CSS).
export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = modeFor(pathname) === "driver"
    ? driverItems.filter((item) => isAdmin || item.href !== "/admin/groups")
    : passengerItems;

  return (
    <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={isActive(pathname, href) ? "active" : ""}>
          <Icon className="icon" size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
