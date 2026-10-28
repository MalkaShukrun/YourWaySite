import { Phone, Route } from "lucide-react";
import { formatTime } from "@/lib/dates";
import type { Stop } from "@/lib/ride-types";
import type { DriverPassenger, DriverRide } from "@/lib/driver-types";
import { avatarColorFor, groupLabel, initialsOf, routeKindLabel } from "@/lib/format";
import { CollapsibleRideCard } from "@/components/driver/CollapsibleRideCard";
import { AddPassengerForm, RemovePassengerButton } from "@/components/driver/PassengerControls";
import { CancelForDateButton, TimeUpdateForm } from "@/components/driver/RideDayControls";
import { LazyRouteMap } from "@/components/map/LazyMaps";
import { iconProps } from "@/components/ui/icon";

// One ride on the driver's dashboard for the chosen date: its passengers, a
// time change or cancellation for that date, and the day's stops. Collapsed
// unless `open`.
export function DriverRideCard({ ride, date, open = false }: { ride: DriverRide & { passengers: DriverPassenger[]; stops: Stop[] }; date: string; open?: boolean }) {
  const bookedStopIds = ride.passengers.flatMap((p) => [p.pickup_stop_id, p.dropoff_stop_id]);
  const byPickup = [...ride.passengers].sort((a, b) => a.pickup_position - b.pickup_position);
  const byDropoff = [...ride.passengers].sort((a, b) => a.dropoff_position - b.dropoff_position);

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
          {ride.cancelled && <span className="status-pill danger"><i></i>בוטלה לתאריך זה</span>}
          <CancelForDateButton routeId={ride.route_id} date={date} cancelled={ride.cancelled} />
        </>
      }
    >
      <TimeUpdateForm
        key={ride.out_time}
        routeId={ride.route_id}
        date={date}
        time={formatTime(ride.out_time)}
        disabled={ride.cancelled}
      />

      <div className="passengers-head">
        <div><h3>טרמפיסטיות רשומות ופרטי קשר</h3><span>{ride.booked} מתוך {ride.seats} מקומות</span></div>
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

      <div className="daily-route-preview">
        <div className="daily-stops">
          <div><h3>התחנות של היום</h3><span>מחולקות לאיסוף ולהורדה</span></div>
          <div className="stop-group-label pickup-label"><i></i>תחנות איסוף</div>
          {byPickup.map((p, i) => (
            <DailyStop key={`p-${p.booking_id}`} n={i + 1} label={p.pickup_label} who={`${p.passenger_name} · איסוף`} />
          ))}
          <div className="stop-group-label dropoff-label"><i></i>תחנות הורדה</div>
          {byDropoff.map((p, i) => (
            <DailyStop key={`d-${p.booking_id}`} n={i + 1} label={p.dropoff_label} who={`${p.passenger_name} · הורדה`} dropoff />
          ))}
          {ride.passengers.length === 0 && <small className="daily-stops-empty">התחנות יופיעו כאן אחרי ההרשמה.</small>}
        </div>
        <div className="daily-map"><LazyRouteMap stops={ride.stops} selectedIds={bookedStopIds} /></div>
      </div>
    </CollapsibleRideCard>
  );
}

function DailyStop({ n, label, who, dropoff = false }: { n: number; label: string; who: string; dropoff?: boolean }) {
  return (
    <div className={`daily-stop ${dropoff ? "dropoff-stop" : ""}`}>
      <span>{n}</span>
      <div><strong>{label}</strong><small>{who}</small></div>
    </div>
  );
}
