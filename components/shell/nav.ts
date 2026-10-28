import { CalendarDays, Check, Home, Route, Search, Settings, User, type LucideIcon } from "lucide-react";

// `shortLabel` and `mobileIcon` are for the mobile tab bar.
export type NavItem = { href: string; label: string; shortLabel: string; icon: LucideIcon; mobileIcon?: LucideIcon };

export const passengerNavItems: NavItem[] = [
  { href: "/", label: "מציאת נסיעה", shortLabel: "חיפוש", icon: Home, mobileIcon: Search },
  { href: "/my-rides", label: "הנסיעות שלי", shortLabel: "נסיעות", icon: CalendarDays },
  { href: "/payments", label: "מעקב תשלומים", shortLabel: "תשלומים", icon: Check },
];

export const driverNavItems: NavItem[] = [
  { href: "/dashboard", label: "לוח נהגת שבועי", shortLabel: "השבוע", icon: Home },
  { href: "/routes", label: "המסלולים שלי", shortLabel: "מסלולים", icon: Route },
];

export const profileNavItem: NavItem = { href: "/profile", label: "הפרופיל שלי", shortLabel: "פרופיל", icon: User };
export const adminNavItem: NavItem = { href: "/admin/groups", label: "ניהול קבוצות", shortLabel: "קבוצות", icon: Settings };

export type Mode = "passenger" | "driver";

// The mode a page belongs to, or null for pages shared by both modes
// (profile, admin) — those keep whichever mode the user was in.
export function modeForPath(pathname: string): Mode | null {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/routes")) return "driver";
  if (pathname.startsWith("/profile") || pathname.startsWith("/admin")) return null;
  return "passenger";
}

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/ride/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
