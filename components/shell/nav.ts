import { CalendarDays, Check, Home, Route, Settings, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const passengerNav: NavItem[] = [
  { href: "/", label: "מציאת נסיעה", icon: Home },
  { href: "/my-rides", label: "הנסיעות שלי", icon: CalendarDays },
  { href: "/payments", label: "מעקב תשלומים", icon: Check },
];

export const driverNav: NavItem[] = [
  { href: "/dashboard", label: "לוח נהגת יומי", icon: Home },
  { href: "/routes", label: "המסלולים שלי", icon: Route },
];

export const profileNav: NavItem = { href: "/profile", label: "הפרופיל שלי", icon: User };
export const adminNav: NavItem = { href: "/admin/groups", label: "ניהול קבוצות", icon: Settings };

type Mode = "passenger" | "driver";

export function modeFor(pathname: string): Mode {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/routes") ? "driver" : "passenger";
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/ride/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
