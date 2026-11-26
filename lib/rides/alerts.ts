// How a ride alert reads in "ההתראות שלי" — safe to import from Client Components.
import type { RideAlert } from "@/lib/rides/types";
import { formatRideDate } from "@/lib/utils/dates";

const hhmm = (time: string | null) => time?.slice(0, 5) ?? "";

// "יום ב׳, 2 בנובמבר – יום ד׳, 4 בנובמבר", "מ־…", "עד …", or "" with no dates.
export function alertDates({ start_date: start, end_date: end }: Pick<RideAlert, "start_date" | "end_date">) {
  if (start && end) return start === end ? formatRideDate(start) : `${formatRideDate(start)} – ${formatRideDate(end)}`;
  if (start) return `מ־${formatRideDate(start)}`;
  if (end) return `עד ${formatRideDate(end)}`;
  return "";
}

// "יציאה 22:00–02:00" (a range may cross midnight), "יציאה מ־…", "יציאה עד …", or "".
export function alertTimes({ from_time, until_time }: Pick<RideAlert, "from_time" | "until_time">) {
  const [from, until] = [hhmm(from_time), hhmm(until_time)];
  if (from && until) return `יציאה ${from}–${until}`;
  if (from) return `יציאה מ־${from}`;
  if (until) return `יציאה עד ${until}`;
  return "";
}

// The last day she hears from the alert, in Israel: an alert that expires at
// midnight is valid through the day before.
export function alertLastDay(expiresAt: string) {
  const lastMoment = new Date(Date.parse(expiresAt) - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(lastMoment);
}
