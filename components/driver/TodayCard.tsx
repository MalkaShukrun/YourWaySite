import type { ReactNode } from "react";
import { Map as MapIcon, Navigation, Phone, Route } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { avatarColorFor, groupLabel, initialsOf, type Stop } from "@/lib/ride-types";
import { googleMapsUrl, wazeUrl, type DriverPassenger, type DriverRide } from "@/lib/driver-types";
import { CancelForDateButton, TimeUpdateForm } from "@/components/driver/RideDayControls";
import { LazyRouteMap } from "@/components/map/LazyRouteMap";

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

export function StatCard({ icon, value, label, tone }: { icon: ReactNode; value: string | number; label: string; tone: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

export function TodayCard({ ride, date }: { ride: DriverRide & { passengers: DriverPassenger[]; stops: Stop[] }; date: string }) {
  const percent = ride.seats ? Math.min(100, Math.round((ride.booked / ride.seats) * 100)) : 0;
  const bookedStopIds = ride.passengers.flatMap((p) => [p.pickup_stop_id, p.dropoff_stop_id]);
  const byPickup = [...ride.passengers].sort((a, b) => a.pickup_position - b.pickup_position);
  const byDropoff = [...ride.passengers].sort((a, b) => a.dropoff_position - b.dropoff_position);

  return (
    <section className={`today-card ${ride.cancelled ? "cancelled" : ""}`}>
      <div className="today-header">
        <div className="today-route">
          <div className="route-badge"><Route {...iconProps} size={20} /></div>
          <div>
            <span>{ride.kind === "recurring" ? "מסלול קבוע" : "נסיעה חד־פעמית"} · יציאה {formatTime(ride.out_time)}</span>
            <h2>{groupLabel(ride.origin, ride.destination)}</h2>
            <p>{ride.seats} מקומות</p>
          </div>
        </div>
        <div className="today-status-actions">
          <span className={`status-pill ${ride.cancelled ? "danger" : ""}`}>
            <i></i>{ride.cancelled ? "בוטלה לתאריך זה" : "מתקיימת כרגיל"}
          </span>
          <CancelForDateButton routeId={ride.route_id} date={date} cancelled={ride.cancelled} />
        </div>
      </div>

      <TimeUpdateForm
        key={ride.out_time}
        routeId={ride.route_id}
        date={date}
        time={formatTime(ride.out_time)}
        disabled={ride.cancelled}
      />

      <div className="passengers-head">
        <div><h3>טרמפיסטיות רשומות ופרטי קשר</h3><span>{ride.booked} מתוך {ride.seats} מקומות</span></div>
        <span className="capacity"><i style={{ width: `${percent}%` }}></i></span>
      </div>
      <div className="passenger-list">
        {ride.passengers.length === 0 ? (
          <p className="passenger-empty">עדיין אין טרמפיסטיות רשומות לנסיעה הזו.</p>
        ) : (
          ride.passengers.map((p, index) => (
            <div className="passenger-row" key={p.booking_id}>
              <div className="passenger-number">{index + 1}</div>
              <div className={`avatar avatar-${avatarColorFor(p.passenger_id)}`}>{initialsOf(p.passenger_name)}</div>
              <div className="passenger-name"><strong>{p.passenger_name}</strong></div>
              <div className="row-actions">
                {p.passenger_phone && (
                  <a className="btn btn-secondary passenger-call" aria-label={`חיוג אל ${p.passenger_name}`} href={`tel:${p.passenger_phone}`}>
                    <Phone {...iconProps} size={20} /><span>{p.passenger_phone}</span>
                  </a>
                )}
                <a className="btn btn-secondary passenger-email" href={`mailto:${p.passenger_email}`}>{p.passenger_email}</a>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="daily-route-preview">
        <div className="daily-map"><LazyRouteMap stops={ride.stops} selectedIds={bookedStopIds} /></div>
        <div className="daily-stops">
          <div><h3>התחנות של היום</h3><span>מחולקות לאיסוף ולהורדה</span></div>
          <div className="stop-group-label pickup-label"><i></i>תחנות איסוף</div>
          {byPickup.map((p, i) => (
            <DailyStop key={`p-${p.booking_id}`} n={i + 1} label={p.pickup_label} who={`${p.passenger_name} · איסוף`} lat={p.pickup_lat} lng={p.pickup_lng} />
          ))}
          <div className="stop-group-label dropoff-label"><i></i>תחנות הורדה</div>
          {byDropoff.map((p, i) => (
            <DailyStop key={`d-${p.booking_id}`} n={i + 1} label={p.dropoff_label} who={`${p.passenger_name} · הורדה`} lat={p.dropoff_lat} lng={p.dropoff_lng} dropoff />
          ))}
          {ride.passengers.length === 0 && <small className="daily-stops-empty">התחנות יופיעו כאן אחרי ההרשמה.</small>}
        </div>
      </div>
    </section>
  );
}

// A stop with direct navigation in Waze / Google Maps (SRS §5.2) — to its pin,
// or by name when the driver didn't mark it on the map.
function DailyStop({ n, label, who, lat, lng, dropoff = false }: { n: number; label: string; who: string; lat: number | null; lng: number | null; dropoff?: boolean }) {
  const place = lat !== null && lng !== null ? { lat, lng } : label;
  return (
    <div className={`daily-stop ${dropoff ? "dropoff-stop" : ""}`}>
      <span>{n}</span>
      <div><strong>{label}</strong><small>{who}</small></div>
      <div className="nav-buttons">
        <a className="btn btn-icon" href={wazeUrl(place)} target="_blank" rel="noreferrer" aria-label={`ניווט ב־Waze אל ${label}`} title="Waze">
          <Navigation {...iconProps} size={18} />
        </a>
        <a className="btn btn-icon" href={googleMapsUrl(place)} target="_blank" rel="noreferrer" aria-label={`ניווט ב־Google Maps אל ${label}`} title="Google Maps">
          <MapIcon {...iconProps} size={18} />
        </a>
      </div>
    </div>
  );
}
