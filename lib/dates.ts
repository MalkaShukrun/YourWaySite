import { addMonths, format, getHours, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";
import { io } from "next/cache";
import { WEEKDAY_LETTERS } from "@/lib/format";
import { ISO_DATE_PATTERN } from "@/lib/validation/patterns";

const TIME_ZONE = "Asia/Jerusalem";

// The current moment in Israel (the server may run in UTC). Awaiting io()
// first keeps the clock out of Next's prerendered shell — call these from
// components rendered behind <Suspense>.
export async function israelNow() {
  await io();
  return TZDate.tz(TIME_ZONE);
}

// Today's date in Israel as "YYYY-MM-DD".
export async function israelToday() {
  return format(await israelNow(), "yyyy-MM-dd");
}

export async function israelHour() {
  return getHours(await israelNow());
}

export function greetingFor(hour: number) {
  if (hour < 12) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  return "ערב טוב";
}

// "2025-06-22" → "יום א׳, 22 ביוני"
export function formatRideDate(isoDate: string) {
  const date = parseISO(isoDate);
  return `יום ${WEEKDAY_LETTERS[date.getDay()]}, ${format(date, "d בMMMM", { locale: he })}`;
}

// "2025-06-22" → "א׳ 22.6"
export function formatShortRideDate(isoDate: string) {
  const date = parseISO(isoDate);
  return `${WEEKDAY_LETTERS[date.getDay()]} ${format(date, "d.M")}`;
}

// The weekdays of some dates, Sunday first: ["2025-06-24", "2025-06-22"] → "א׳ · ג׳"
export function weekdaysOf(isoDates: string[]) {
  const days = [...new Set(isoDates.map((d) => parseISO(d).getDay()))].sort((a, b) => a - b);
  return days.map((d) => WEEKDAY_LETTERS[d]).join(" · ");
}

// "07:15:00" → "07:15"
export function formatTime(time: string | null) {
  return time ? time.slice(0, 5) : "";
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(parseISO(value).getTime());
}

// "2025-06" → "יוני 2025"
export function formatMonth(month: string) {
  return format(parseISO(`${month}-01`), "LLLL yyyy", { locale: he });
}

// The current month and the `past` months before it, newest first — never a
// future month: ["2025-06", "2025-05", …]
export function recentMonths(today: string, past = 3) {
  const first = parseISO(`${today.slice(0, 7)}-01`);
  return Array.from({ length: past + 1 }, (_, i) => format(addMonths(first, -i), "yyyy-MM"));
}
