"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, Check } from "lucide-react";
import { bookRide } from "@/app/(app)/(passenger)/actions";
import type { RideSummary, Stop } from "@/lib/ride-types";
import { formatRideDate, formatShortRideDate, formatTime } from "@/lib/dates";
import { formatPrice, seatsText } from "@/lib/format";
import { LazyRouteMap } from "@/components/map/LazyMaps";
import { iconProps } from "@/components/ui/icon";

type Props = {
  routeId: string;
  date: string; // the date being viewed
  price: number;
  stops: Stop[];
  canBook: boolean;
  blockedReason: string | null;
  alreadyBooked: boolean;
  days: RideSummary[]; // the route's upcoming dates; several for a recurring ride
  bookedDates: string[]; // dates of this route the user is already booked on
};

// Day selection (several days of a recurring ride at once), stop selection and
// one-click booking (SRS §4.2), with the route map below.
export function BookingForm({ routeId, date, price, stops, canBook, blockedReason, alreadyBooked, days, bookedDates }: Props) {
  const pickups = stops.filter((s) => s.kind === "pickup");
  const dropoffs = stops.filter((s) => s.kind === "dropoff");
  const pickDays = days.length > 1;
  const [pickupId, setPickupId] = useState(pickups[0]?.id ?? "");
  const [dropoffId, setDropoffId] = useState(dropoffs[0]?.id ?? "");
  const [dates, setDates] = useState(canBook && !alreadyBooked ? [date] : []);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const toggleDate = (day: string) =>
    setDates((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));

  const submit = () =>
    startTransition(async () => {
      setError("");
      const result = await bookRide({ routeId, dates, pickupStopId: pickupId, dropoffStopId: dropoffId });
      if (result?.error) setError(result.error);
    });

  // With a day picker, booked days are shown there and the others stay open.
  const showBookedLink = pickDays ? days.every((d) => bookedDates.includes(d.ride_date) || d.seats_left <= 0) && bookedDates.length > 0 : alreadyBooked;
  const buttonLabel = pending
    ? "רושמת…"
    : pickDays
      ? dates.length === 0 ? "בחרי לפחות יום אחד" : dates.length > 1 ? `אישור הרשמה ל־${dates.length} ימים` : "אישור הרשמה לנסיעה"
      : canBook ? "אישור הרשמה לנסיעה" : blockedReason;

  return (
    <>
      {pickDays && (
        <section className="booking-card ride-days">
          <div className="booking-step">
            <span className="step-number"><CalendarDays {...iconProps} size={16} /></span>
            <div><h2>בחרי ימים</h2><p>נסיעה קבועה — אפשר לסמן כמה ימים ולהירשם לכולם יחד</p></div>
          </div>
          <DayOptions days={days} time={days[0].out_time} selected={dates} booked={bookedDates} onToggle={toggleDate} />
        </section>
      )}
      <section className="booking-card station-booking-card">
        <div className="booking-step">
          <span className="step-number">1</span>
          <div><h2>בחרי תחנת איסוף</h2><p>התחנה שבה תעלי לנסיעה</p></div>
        </div>
        <StopOptions className="pickup-options" stops={pickups} selected={pickupId} onSelect={setPickupId} hint="תחנת איסוף" />

        <div className="booking-step">
          <span className="step-number dropoff-step">2</span>
          <div><h2>בחרי תחנת הורדה</h2><p>התחנה שבה תרדי מהנסיעה</p></div>
        </div>
        <StopOptions className="dropoff-options" stops={dropoffs} selected={dropoffId} onSelect={setDropoffId} hint="תחנה מורשית" />

        <div className="booking-action-row">
          <div className="booking-info">
            <div className="booking-summary">
              <span>
                {dates.length > 1 ? `סה״כ ל־${dates.length} נסיעות (${formatPrice(price)} לנסיעה)` : "מחיר הנסיעה שקבעה הנהגת"}
              </span>
              <strong>{formatPrice(price * Math.max(dates.length, 1))}</strong>
            </div>
            <p className="booking-note">אם הנסיעה לא בוטלה יופיע במעקב תשלומים חיוב על הנסיעה.</p>
          </div>
          {showBookedLink ? (
            <div className="booked-link">
              <span>את רשומה לנסיעה</span>
              <Link className="btn btn-secondary" href="/my-rides">לנסיעות שלי</Link>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={(!pickDays && !canBook) || dates.length === 0 || pending || !pickupId || !dropoffId}
            >
              {buttonLabel}
            </button>
          )}
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </section>

      <section className="panel map-panel">
        <div className="panel-title">
          <div><h2>המסלול והתחנות</h2><span>תחנות האיסוף וההורדה שסומנו על ידי הנהגת</span></div>
        </div>
        <LazyRouteMap stops={stops} selectedIds={[pickupId, dropoffId]} />
      </section>
    </>
  );
}

// The route's dates as toggles. Full days and days already booked can't be picked.
function DayOptions({
  days,
  time,
  selected,
  booked,
  onToggle,
}: {
  days: RideSummary[];
  time: string; // the route's usual departure; a date that differs shows its own
  selected: string[];
  booked: string[];
  onToggle: (date: string) => void;
}) {
  return (
    <div className="trip-dates" role="group" aria-label="ימי הנסיעה">
      {days.map((day) => {
        const label = formatShortRideDate(day.ride_date);
        const isBooked = booked.includes(day.ride_date);
        const full = day.seats_left <= 0;
        if (isBooked || full) {
          const detail = isBooked ? "רשומה" : "מלאה";
          return (
            <span key={day.ride_date} className="is-full" aria-label={`${formatRideDate(day.ride_date)}, ${isBooked ? "את רשומה" : "הנסיעה מלאה"}`}>
              {label}<small>{detail}</small>
            </span>
          );
        }
        const isSelected = selected.includes(day.ride_date);
        const detail = day.out_time !== time ? formatTime(day.out_time) : `${day.seats_left} פנויים`;
        return (
          <button
            key={day.ride_date}
            type="button"
            className={isSelected ? "selected" : undefined}
            aria-pressed={isSelected}
            aria-label={`${formatRideDate(day.ride_date)}, ${seatsText(day.seats_left)}`}
            onClick={() => onToggle(day.ride_date)}
          >
            {label}<small>{detail}</small>
          </button>
        );
      })}
    </div>
  );
}

function StopOptions({
  stops,
  selected,
  onSelect,
  className,
  hint,
}: {
  stops: Stop[];
  selected: string;
  onSelect: (id: string) => void;
  className: string;
  hint: string;
}) {
  if (stops.length === 0) return <p className="stop-options-empty">אין תחנות מוגדרות.</p>;
  return (
    <div className={`stop-options ${className}`} role="radiogroup">
      {stops.map((stop, index) => (
        <button
          key={stop.id}
          type="button"
          role="radio"
          aria-checked={selected === stop.id}
          className={selected === stop.id ? "selected" : ""}
          onClick={() => onSelect(stop.id)}
        >
          <span className="radio-dot"></span>
          <div><strong>{stop.label}</strong><small>{hint} {index + 1}</small></div>
          {selected === stop.id && <Check {...iconProps} size={17} />}
        </button>
      ))}
    </div>
  );
}
