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

export type Mode = "passenger" | "driver";

// The mode a page belongs to, or null for pages shared by both modes
// (profile, admin) — those keep whichever mode the user was in.
export function routeMode(pathname: string): Mode | null {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/routes")) return "driver";
  if (pathname.startsWith("/profile") || pathname.startsWith("/admin")) return null;
  return "passenger";
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/ride/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
