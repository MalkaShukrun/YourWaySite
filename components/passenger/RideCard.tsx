import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { formatRideDate, formatTime } from "@/lib/dates";
import type { RideSummary } from "@/lib/ride-types";
import { avatarColorFor, formatPrice, initialsOf, kindLabel, seatsText } from "@/lib/format";
import { iconProps } from "@/components/ui/icon";

// A search result (SRS §4.1), linking to the ride's details and booking.
export function RideCard({ ride }: { ride: RideSummary }) {
  const full = ride.seats_left <= 0;
  return (
    <article className="trip-card">
      <div className="trip-top">
        <div className="driver">
          <div className={`avatar avatar-${avatarColorFor(ride.driver_id)}`}>{initialsOf(ride.driver_name)}</div>
          <div><span>הנהגת שלך</span><strong>{ride.driver_name}</strong></div>
        </div>
        <span className={`trip-type ${ride.kind === "one_time" ? "special" : ""}`}>{kindLabel(ride.kind)}</span>
      </div>
      <div className="route-line">
        <div className="route-node start"></div>
        <div className="route-path"></div>
        <div className="route-node end"><MapPin {...iconProps} size={13} /></div>
      </div>
      <div className="route-names">
        <div><span>יציאה מ־</span><strong>{ride.origin}</strong></div>
        <div><span>יעד</span><strong>{ride.destination}</strong></div>
      </div>
      <div className="trip-info">
        <div><CalendarDays {...iconProps} size={20} /><span>{formatRideDate(ride.ride_date)}</span></div>
        <div><Clock {...iconProps} size={20} /><span>יציאה ב־<b>{formatTime(ride.out_time)}</b></span></div>
        <div className="trip-price"><span>מחיר שקבעה הנהגת</span><b>{formatPrice(ride.price)}</b></div>
      </div>
      <div className="trip-footer">
        <div className="seats">
          <span className="seat-icon"><Users {...iconProps} size={18} /></span>
          <div>
            <strong>{full ? "הנסיעה מלאה" : seatsText(ride.seats_left)}</strong>
            <span>מתוך {ride.seats} מקומות</span>
          </div>
        </div>
        {full ? (
          <span className="btn btn-secondary is-disabled" aria-disabled="true">אין מקום</span>
        ) : (
          <Link className="btn btn-primary" href={`/ride/${ride.route_id}?date=${ride.ride_date}`}>
            לפרטים והרשמה <ArrowLeft {...iconProps} size={18} />
          </Link>
        )}
      </div>
    </article>
  );
}
