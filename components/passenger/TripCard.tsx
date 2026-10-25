import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { formatRideDate, formatTime } from "@/lib/dates";
import type { RideSummary } from "@/lib/ride-types";
import { avatarColorFor, formatPrice, initialsOf, kindLabel, seatsText } from "@/lib/format";

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

export function TripCard({ trip }: { trip: RideSummary }) {
  const full = trip.seats_left <= 0;
  return (
    <article className="trip-card">
      <div className="trip-top">
        <div className="driver">
          <div className={`avatar avatar-${avatarColorFor(trip.driver_id)}`}>{initialsOf(trip.driver_name)}</div>
          <div><span>הנהגת שלך</span><strong>{trip.driver_name}</strong></div>
        </div>
        <span className={`trip-type ${trip.kind === "one_time" ? "special" : ""}`}>{kindLabel(trip.kind)}</span>
      </div>
      <div className="route-line">
        <div className="route-node start"></div>
        <div className="route-path"></div>
        <div className="route-node end"><MapPin {...iconProps} size={13} /></div>
      </div>
      <div className="route-names">
        <div><span>יציאה מ־</span><strong>{trip.origin}</strong></div>
        <div><span>יעד</span><strong>{trip.destination}</strong></div>
      </div>
      <div className="trip-info">
        <div><CalendarDays {...iconProps} size={20} /><span>{formatRideDate(trip.ride_date)}</span></div>
        <div><Clock {...iconProps} size={20} /><span>יציאה ב־<b>{formatTime(trip.out_time)}</b></span></div>
        <div className="trip-price"><span>מחיר שקבעה הנהגת</span><b>{formatPrice(trip.price)}</b></div>
      </div>
      <div className="trip-footer">
        <div className="seats">
          <span className="seat-icon"><Users {...iconProps} size={18} /></span>
          <div>
            <strong>{full ? "הנסיעה מלאה" : seatsText(trip.seats_left)}</strong>
            <span>מתוך {trip.seats} מקומות</span>
          </div>
        </div>
        {full ? (
          <span className="btn btn-secondary is-disabled" aria-disabled="true">אין מקום</span>
        ) : (
          <Link className="btn btn-primary" href={`/ride/${trip.route_id}?date=${trip.ride_date}`}>
            לפרטים והרשמה <ArrowLeft {...iconProps} size={18} />
          </Link>
        )}
      </div>
    </article>
  );
}
