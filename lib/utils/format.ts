// Display helpers shared by the screens — safe to import from Client Components.
import type { RideKind } from "@/lib/rides/types";

export function groupLabel(origin: string, destination: string) {
  return `${origin} ← ${destination}`;
}

export function firstNameOf(name: string) {
  return name.split(/\s+/)[0];
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

const AVATAR_COLORS = ["coral", "lavender", "mint", "sand"] as const;
export function avatarColorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function kindLabel(kind: RideKind) {
  return kind === "recurring" ? "קבועה" : "חד־פעמית";
}

// The driver's wording: "מסלול קבוע" / "נסיעה חד־פעמית".
export function routeKindLabel(kind: RideKind) {
  return kind === "recurring" ? "מסלול קבוע" : "נסיעה חד־פעמית";
}

export function formatPrice(price: number) {
  return `₪${Number(price).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}

export function seatsText(n: number) {
  return n === 1 ? "מקום פנוי אחד" : `${n} מקומות פנויים`;
}

export const WEEKDAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]; // Sunday … Saturday
export const RIDE_WEEKDAYS = WEEKDAY_LETTERS.slice(0, 6); // Sunday … Friday

export function weekdaysLabel(days: number[]) {
  return days.map((d) => WEEKDAY_LETTERS[d]).join(" · ");
}
