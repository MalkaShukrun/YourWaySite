"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { bookRide } from "@/app/(app)/(passenger)/actions";
import type { Stop } from "@/lib/ride-types";
import { formatPrice } from "@/lib/format";
import { LazyRouteMap } from "@/components/map/LazyRouteMap";

type Props = {
  routeId: string;
  date: string;
  price: number;
  stops: Stop[];
  canBook: boolean;
  blockedReason: string | null;
  alreadyBooked: boolean;
};

// Stop selection + one-click booking (SRS §4.2), with the route map below.
export function BookingForm({ routeId, date, price, stops, canBook, blockedReason, alreadyBooked }: Props) {
  const pickups = stops.filter((s) => s.kind === "pickup");
  const dropoffs = stops.filter((s) => s.kind === "dropoff");
  const [pickupId, setPickupId] = useState(pickups[0]?.id ?? "");
  const [dropoffId, setDropoffId] = useState(dropoffs[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError("");
      const result = await bookRide({ routeId, date, pickupStopId: pickupId, dropoffStopId: dropoffId });
      if (result?.error) setError(result.error);
    });

  return (
    <>
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
          <div className="booking-summary">
            <span>מחיר הנסיעה שקבעה הנהגת</span>
            <strong>{formatPrice(price)}</strong>
          </div>
          {alreadyBooked ? (
            <Link className="btn btn-secondary" href="/my-rides">את רשומה לנסיעה · לנסיעות שלי</Link>
          ) : (
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={!canBook || pending || !pickupId || !dropoffId}
            >
              {pending ? "רושמת…" : canBook ? "אישור הרשמה לנסיעה" : blockedReason}
            </button>
          )}
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="booking-note">אם הנסיעה לא בוטלה יופיע במעקב תשלומים חיוב על הנסיעה.</p>
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
          {selected === stop.id && <Check className="icon" size={17} strokeWidth={1.8} />}
        </button>
      ))}
    </div>
  );
}
