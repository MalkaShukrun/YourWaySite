import type { CSSProperties } from "react";
import { format, parseISO } from "date-fns";
import type { UpcomingDay } from "@/lib/admin/data";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { seatsText, WEEKDAY_LETTERS } from "@/lib/utils/format";

// The next 7 days, today first: how many passengers joined each day's rides,
// and how full those rides are. Render only for admins (the caller checks
// with requireAdmin).
export function UpcomingPassengersSection({ days }: { days: UpcomingDay[] }) {
  const passengers = days.reduce((sum, d) => sum + d.passengers, 0);
  const rides = days.reduce((sum, d) => sum + d.rides, 0);
  return (
    <CollapsiblePanel title="טרמפיסטיות בשבוע הקרוב" subtitle="כמה טרמפיסטיות הצטרפו לנסיעות בכל אחד מ־7 הימים הקרובים">
      <p className="upcoming-total">
        סה״כ <strong>{passengers}</strong> טרמפיסטיות ב־<strong>{rides}</strong> נסיעות
      </p>
      <ol className="upcoming-days">
        {days.map((d, i) => <UpcomingDayTile key={d.day} day={d} label={dayLabel(d.day, i)} today={i === 0} />)}
      </ol>
    </CollapsiblePanel>
  );
}

function UpcomingDayTile({ day, label, today }: { day: UpcomingDay; label: string; today: boolean }) {
  const date = format(parseISO(day.day), "d.M");
  if (day.rides === 0) {
    return (
      <li className={`upcoming-day is-empty ${today ? "is-today" : ""}`}>
        <div className="upcoming-date"><strong>{label}</strong><span>{date}</span></div>
        <div className="upcoming-count"><strong>–</strong></div>
        <small>אין נסיעות</small>
      </li>
    );
  }
  // The bar is the share of the day's seats that passengers took.
  const fill = day.seats ? Math.min(day.passengers / day.seats, 1) : 0;
  return (
    <li className={`upcoming-day ${today ? "is-today" : ""} ${fill >= 1 ? "is-full" : ""}`}>
      <div className="upcoming-date"><strong>{label}</strong><span>{date}</span></div>
      <div className="upcoming-count"><strong>{day.passengers}</strong><span>טרמפיסטיות</span></div>
      <span className="upcoming-bar" role="img" aria-label={`${day.passengers} מתוך ${day.seats} מקומות תפוסים`} style={{ "--fill": `${fill * 100}%` } as CSSProperties}><i /></span>
      <small>
        {day.rides === 1 ? "נסיעה אחת" : `${day.rides} נסיעות`} · {fill >= 1 ? "מלא" : seatsText(day.seats - day.passengers)}
      </small>
    </li>
  );
}

// "היום", "מחר", then the weekday: "יום ה׳".
function dayLabel(isoDate: string, index: number) {
  if (index === 0) return "היום";
  if (index === 1) return "מחר";
  return `יום ${WEEKDAY_LETTERS[parseISO(isoDate).getDay()]}`;
}
