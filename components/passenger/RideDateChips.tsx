import Link from "next/link";
import { formatRideDate, formatShortRideDate, formatTime } from "@/lib/dates";
import type { RideSummary } from "@/lib/ride-types";
import { seatsText } from "@/lib/format";

type Props = {
  rides: RideSummary[]; // one route's dates
  time: string; // the route's usual departure; a date that differs shows its own
  selected?: string; // the date being viewed (ride page)
};

// A recurring route's dates, each linking to its booking page. A full date
// can't be picked.
export function RideDateChips({ rides, time, selected }: Props) {
  return (
    <div className="trip-dates">
      {rides.map((ride) => {
        const full = ride.seats_left <= 0;
        const isSelected = ride.ride_date === selected;
        const label = formatShortRideDate(ride.ride_date);
        const detail = full ? "מלאה" : ride.out_time !== time ? formatTime(ride.out_time) : `${ride.seats_left} פנויים`;
        const name = `${formatRideDate(ride.ride_date)}, ${full ? "הנסיעה מלאה" : seatsText(ride.seats_left)}`;

        if (full && !isSelected) {
          return (
            <span key={ride.ride_date} className="is-full" aria-label={name}>
              {label}<small>{detail}</small>
            </span>
          );
        }
        return (
          <Link
            key={ride.ride_date}
            href={`/ride/${ride.route_id}?date=${ride.ride_date}`}
            className={isSelected ? "selected" : undefined}
            aria-current={isSelected ? "date" : undefined}
            aria-label={name}
            scroll={selected === undefined} // switching days on the ride page keeps the place
          >
            {label}<small>{detail}</small>
          </Link>
        );
      })}
    </div>
  );
}
