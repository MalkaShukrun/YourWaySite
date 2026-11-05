import { Mail, Phone } from "lucide-react";
import { formatTime } from "@/lib/utils/dates";
import { isPlaced, type Stop } from "@/lib/rides/types";
import type { DriverPassenger, DriverRide } from "@/lib/driver/types";
import { avatarColorFor, initialsOf, routeKindLabel } from "@/lib/utils/format";
import { CollapsibleRideCard } from "@/components/driver/CollapsibleRideCard";
import { AddPassengerForm, RemovePassengerButton } from "@/components/driver/PassengerControls";
import { CancelForDateButton } from "@/components/driver/RideDayControls";
import { LazyRouteMap } from "@/components/map/LazyMaps";
import { iconProps } from "@/components/ui/icon";
import { GroupName } from "@/components/ui/PlaceName";

// One ride on the driver's dashboard for the chosen date: its passengers, a
// cancellation for that date, and the day's stops. A ride that
// has `departed` can't be cancelled. Collapsed unless `open`.
export function DriverRideCard({ ride, date, departed = false, open = false }: { ride: DriverRide & { passengers: DriverPassenger[]; stops: Stop[] }; date: string; departed?: boolean; open?: boolean }) {
  const bookedStopIds = ride.passengers.flatMap((p) => [p.pickup_stop_id, p.dropoff_stop_id]);
  const pickups = stopsInOrder(ride.passengers, (p) => ({ id: p.pickup_stop_id, label: p.pickup_label, position: p.pickup_position }));
  const dropoffs = stopsInOrder(ride.passengers, (p) => ({ id: p.dropoff_stop_id, label: p.dropoff_label, position: p.dropoff_position }));
  // The stops box shows only once someone has booked; the map only when stops are marked on it.
  const hasPassengers = ride.passengers.length > 0;
  const hasMap = ride.stops.some(isPlaced);

  return (
    <CollapsibleRideCard
      cancelled={ride.cancelled}
      defaultOpen={open}
      summary={
        <div className="today-route">
          <strong className="today-time">{formatTime(ride.out_time)}</strong>
          <div>
            <h2><GroupName origin={ride.origin} destination={ride.destination} /></h2>
            <div className="ride-chips">
              <span className="ride-chip">{routeKindLabel(ride.kind)}</span>
              <span className={`ride-chip ${ride.booked >= ride.seats ? "full" : ""}`}>{ride.booked} מתוך {ride.seats} מקומות</span>
            </div>
          </div>
        </div>
      }
      actions={
        <>
          {ride.cancelled
            ? <span className="status-pill danger"><i></i>בוטלה לתאריך זה</span>
            : !departed && <CancelForDateButton routeId={ride.route_id} date={date} />}
        </>
      }
    >
      <div className="passengers-head">
        <h3>טרמפיסטיות רשומות ופרטי קשר</h3>
      </div>
      <div className="passenger-list">
        {ride.passengers.length === 0 ? (
          <p className="passenger-empty">עדיין אין טרמפיסטיות רשומות לנסיעה הזו.</p>
        ) : (
          ride.passengers.map((p, index) => (
            <div className="passenger-row" key={p.booking_id}>
              <div className="passenger-number">{index + 1}</div>
              <div className={`avatar avatar-${avatarColorFor(p.passenger_id ?? p.booking_id)}`}>{initialsOf(p.passenger_name)}</div>
              <div className="passenger-name">
                <strong>{p.passenger_name}</strong>
                <small>
                  איסוף: {p.pickup_label} · הורדה: {p.dropoff_label}
                  {p.added_by_driver && " · נוספה על ידך"}
                </small>
              </div>
              <div className="row-actions">
                {p.passenger_phone && (
                  <a className="btn btn-secondary passenger-contact" aria-label={`חיוג אל ${p.passenger_name}`} title={p.passenger_phone} href={`tel:${p.passenger_phone}`}>
                    <Phone {...iconProps} size={19} /><span className="visually-hidden">{p.passenger_phone}</span>
                  </a>
                )}
                {p.passenger_email && (
                  <a className="btn btn-secondary passenger-contact" aria-label={`מייל אל ${p.passenger_name}`} title={p.passenger_email} href={`mailto:${p.passenger_email}`}>
                    <Mail {...iconProps} size={19} /><span className="visually-hidden">{p.passenger_email}</span>
                  </a>
                )}
                {p.added_by_driver && <RemovePassengerButton bookingId={p.booking_id} name={p.passenger_name} />}
              </div>
            </div>
          ))
        )}
        {!ride.cancelled && ride.booked < ride.seats && (
          <div className="passenger-add">
            <AddPassengerForm routeId={ride.route_id} date={date} stops={ride.stops} />
          </div>
        )}
      </div>

      {(hasPassengers || hasMap) && (
        <div className="daily-route-preview">
          {hasPassengers && (
            <div className="daily-stops">
              <div className="daily-stops-head">
                <h3>התחנות של היום</h3>
                <div className="stop-legend"><span><i className="pickup-dot"></i>איסוף</span><span><i className="dropoff-dot"></i>הורדה</span></div>
              </div>
              {/* One line from the first pickup to the last drop-off. */}
              <div className="daily-stop-list">
                {pickups.map((s, i) => (
                  <DailyStop key={`p-${s.id}`} n={i + 1} label={s.label} names={s.names} />
                ))}
                {dropoffs.map((s, i) => (
                  <DailyStop key={`d-${s.id}`} n={i + 1} label={s.label} names={s.names} dropoff />
                ))}
              </div>
            </div>
          )}
          {/* The stops box has the legend; the map shows its own only without it. */}
          {hasMap && <div className="daily-map"><LazyRouteMap stops={ride.stops} selectedIds={bookedStopIds} legend={!hasPassengers} /></div>}
        </div>
      )}
    </CollapsibleRideCard>
  );
}

// The booked stops in route order, each listed once with everyone getting on or off there.
// Stops are matched by name, since the same place can be saved as more than one stop.
function stopsInOrder(passengers: DriverPassenger[], stopOf: (p: DriverPassenger) => { id: string; label: string; position: number }) {
  const stops = new Map<string, { id: string; label: string; position: number; names: string[] }>();
  for (const p of passengers) {
    const stop = stopOf(p);
    const key = stop.label.trim();
    const entry = stops.get(key) ?? { ...stop, names: [] };
    entry.position = Math.min(entry.position, stop.position);
    entry.names.push(p.passenger_name);
    stops.set(key, entry);
  }
  return [...stops.values()].sort((a, b) => a.position - b.position);
}

function DailyStop({ n, label, names, dropoff = false }: { n: number; label: string; names: string[]; dropoff?: boolean }) {
  return (
    <div className={`daily-stop ${dropoff ? "dropoff-stop" : ""}`}>
      <span>{n}</span>
      <div><strong>{label}</strong><small>{names.join(", ")}</small></div>
    </div>
  );
}
