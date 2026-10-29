import { Phone, Route } from "lucide-react";
import { formatTime } from "@/lib/utils/dates";
import { isPlaced, type Stop } from "@/lib/rides/types";
import type { DriverPassenger, DriverRide } from "@/lib/driver/types";
import { avatarColorFor, groupLabel, initialsOf, routeKindLabel } from "@/lib/utils/format";
import { CollapsibleRideCard } from "@/components/driver/CollapsibleRideCard";
import { AddPassengerForm, RemovePassengerButton } from "@/components/driver/PassengerControls";
import { CancelForDateButton } from "@/components/driver/RideDayControls";
import { LazyRouteMap } from "@/components/map/LazyMaps";
import { iconProps } from "@/components/ui/icon";

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
          <div className="route-badge"><Route {...iconProps} size={20} /></div>
          <div>
            <span>{routeKindLabel(ride.kind)}</span>
            <h2>{groupLabel(ride.origin, ride.destination)}</h2>
            <p>{formatTime(ride.out_time)} · {ride.booked} מתוך {ride.seats} מקומות</p>
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
        {!ride.cancelled && ride.booked < ride.seats && (
          <AddPassengerForm routeId={ride.route_id} date={date} stops={ride.stops} />
        )}
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
                {p.added_by_driver && <small>נוספה על ידך</small>}
              </div>
              <div className="row-actions">
                {p.passenger_phone && (
                  <a className="btn btn-secondary passenger-call" aria-label={`חיוג אל ${p.passenger_name}`} href={`tel:${p.passenger_phone}`}>
                    <Phone {...iconProps} size={20} /><span>{p.passenger_phone}</span>
                  </a>
                )}
                {p.passenger_email && (
                  <a className="btn btn-secondary passenger-email" href={`mailto:${p.passenger_email}`}>{p.passenger_email}</a>
                )}
                {p.added_by_driver && <RemovePassengerButton bookingId={p.booking_id} name={p.passenger_name} />}
              </div>
            </div>
          ))
        )}
      </div>

      {(hasPassengers || hasMap) && (
        <div className="daily-route-preview">
          {hasPassengers && (
            <div className="daily-stops">
              <div><h3>התחנות של היום</h3></div>
              <div className="daily-stop-groups">
                <div>
                  <div className="stop-group-label pickup-label"><i></i>תחנות איסוף</div>
                  {pickups.map((s, i) => (
                    <DailyStop key={`p-${s.id}`} n={i + 1} label={s.label} names={s.names} />
                  ))}
                </div>
                <div>
                  <div className="stop-group-label dropoff-label"><i></i>תחנות הורדה</div>
                  {dropoffs.map((s, i) => (
                    <DailyStop key={`d-${s.id}`} n={i + 1} label={s.label} names={s.names} dropoff />
                  ))}
                </div>
              </div>
            </div>
          )}
          {hasMap && <div className="daily-map"><LazyRouteMap stops={ride.stops} selectedIds={bookedStopIds} /></div>}
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
      <div><strong>{label}</strong>{names.map((name, i) => <small key={i}>{name}</small>)}</div>
    </div>
  );
}
