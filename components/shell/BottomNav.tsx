"use client";

import Link from "next/link";
import { iconProps } from "@/components/ui/icon";
import { adminNavItem, driverNavItems, isNavItemActive, passengerNavItems, profileNavItem } from "./nav";
import { useMode } from "./useMode";
import { useShellPathname } from "./useShellPathname";

// Mobile-only tab bar (hidden on desktop by the design CSS). The admin tab
// shows in driver mode only, for admins.
export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = useShellPathname();
  const items = useMode() === "driver"
    ? [...driverNavItems, ...(isAdmin ? [adminNavItem] : []), profileNavItem]
    : [...passengerNavItems, profileNavItem];

  return (
    <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(({ href, shortLabel, icon, mobileIcon }) => {
        const Icon = mobileIcon ?? icon;
        return (
          <Link key={href} href={href} className={isNavItemActive(pathname, href) ? "active" : ""}>
            <Icon {...iconProps} size={20} />
            <span>{shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
