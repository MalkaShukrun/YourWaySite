import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MapPin, MessageSquareText, Users } from "lucide-react";
import { formatTime, weekdaysOf } from "@/lib/utils/dates";
import type { RideSummary } from "@/lib/rides/types";
import { avatarColorFor, formatPrice, initialsOf, kindLabel } from "@/lib/utils/format";
import { iconProps } from "@/components/ui/icon";
import { RideDateChips } from "@/components/passenger/RideDateChips";

const rideHref = (ride: RideSummary) => `/ride/${ride.route_id}?date=${ride.ride_date}`;

// A search result (SRS §4.1): one route, with every date it runs in the
// results — a recurring route shows its dates together on one card. The
// driver sees her `own` rides too, to check how they look, but can't book them.
export function RideCard({ rides, own = false }: { rides: RideSummary[]; own?: boolean }) {
  const [first] = rides;
  const next = rides.find((r) => r.seats_left > 0);
  const severalDates = rides.length > 1;

  return (
    <article className="trip-card">
      <div className="trip-top">
        <div className="driver">
          <div className={`avatar avatar-${avatarColorFor(first.driver_id)}`}>{initialsOf(first.driver_name)}</div>
          <div><span>{own ? "הנסיעה שלך" : "הנהגת שלך"}</span><strong>{first.driver_name}</strong></div>
        </div>
        <span className={`trip-type ${first.kind === "one_time" ? "special" : ""}`}>{kindLabel(first.kind)}</span>
      </div>
      <div className="route-line">
        <div className="route-node start"></div>
        <div className="route-path"></div>
        <div className="route-node end"><MapPin {...iconProps} size={13} /></div>
      </div>
      <div className="route-names">
        <div><span>יציאה מ־</span><strong>{first.origin}</strong></div>
        <div><span>יעד</span><strong>{first.destination}</strong></div>
      </div>
      <div className="trip-info">
        <div>
          <CalendarDays {...iconProps} size={20} />
          <span>{severalDates ? "בימים" : "ביום"} <b>{weekdaysOf(rides.map((r) => r.ride_date))}</b></span>
        </div>
        {/* Every card shows its dates as chips — one for a single date — so all cards share one layout. */}
        <RideDateChips rides={rides} />
        <div><Clock {...iconProps} size={20} /><span>יציאה ב־<b>{formatTime(first.out_time)}</b></span></div>
        {/* One line here; the full note, with its line breaks, in the bubble. */}
        {first.notes && (
          <p className="trip-notes is-clamped">
            <MessageSquareText {...iconProps} size={18} />
            <span className="trip-notes-text">{first.notes}</span>
            <span className="hint notes-more" tabIndex={0}>
              עוד פרטים
              <span className="hint-bubble" role="tooltip">{first.notes}</span>
            </span>
          </p>
        )}
        <div className="trip-price"><span>מחיר שקבעה הנהגת</span><b>{formatPrice(first.price)}</b></div>
      </div>
      <div className="trip-footer">
        <div className="seats">
          <span className="seat-icon"><Users {...iconProps} size={18} /></span>
          {/* The ride's size only; each date's free seats are on its chip. */}
          <div><strong>{first.seats === 1 ? "נוסעת אחת" : `עד ${first.seats} נוסעות`}</strong></div>
        </div>
        {own ? (
          <Link className="btn btn-secondary" href={rideHref(next ?? first)}>
            צפייה בנסיעה <ArrowLeft {...iconProps} size={18} />
          </Link>
        ) : next ? (
          <Link className="btn btn-primary" href={rideHref(next)}>
            לפרטים והרשמה <ArrowLeft {...iconProps} size={18} />
          </Link>
        ) : (
          <span className="btn btn-secondary is-disabled" aria-disabled="true">אין מקום</span>
        )}
      </div>
    </article>
  );
}
