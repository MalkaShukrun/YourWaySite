import Link from "next/link";
import { formatRideDate, formatShortRideDate } from "@/lib/utils/dates";
import type { RideSummary } from "@/lib/rides/types";
import { seatsText } from "@/lib/utils/format";

// A route's dates on its search card (a single one for a one-time ride), each linking to its
// booking page. A full date can't be picked.
export function RideDateChips({ rides }: { rides: RideSummary[] }) {
  return (
    <div className="trip-dates">
      {rides.map((ride) => {
        const full = ride.seats_left <= 0;
        const label = formatShortRideDate(ride.ride_date);
        const name = `${formatRideDate(ride.ride_date)}, ${full ? "הנסיעה מלאה" : seatsText(ride.seats_left)}`;

        if (full) {
          return (
            <span key={ride.ride_date} className="is-full" aria-label={name}>
              {label}<small>מלאה</small>
            </span>
          );
        }
        return (
          <Link key={ride.ride_date} href={`/ride/${ride.route_id}?date=${ride.ride_date}`} aria-label={name}>
            {label}<small>{ride.seats_left} פנויים</small>
          </Link>
        );
      })}
    </div>
  );
}
