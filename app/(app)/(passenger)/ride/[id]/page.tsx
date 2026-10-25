import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Car, Phone, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatRideDate, formatTime, isIsoDate } from "@/lib/dates";
import { getRide } from "@/lib/rides";
import { avatarColorFor, initialsOf, kindLabel, seatsText } from "@/lib/format";
import { BookingForm } from "@/components/passenger/BookingForm";

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;
const UUID = /^[0-9a-f-]{36}$/i;

// Ride details & booking (SRS §4.2).
export default function RidePage({ params, searchParams }: PageProps<"/ride/[id]">) {
  return (
    <main className="page-content">
      <Link className="back-link" href="/">
        <ArrowLeft {...iconProps} size={17} /> חזרה לכל הנסיעות
      </Link>
      <Suspense fallback={<div className="detail-layout" aria-busy="true" />}>
        <RideDetails params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function RideDetails({ params, searchParams }: PageProps<"/ride/[id]">) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const date = query.date;
  if (!UUID.test(id) || !isIsoDate(date)) notFound();

  const result = await getRide(id, date);
  if (!result) notFound();
  const { ride, stops } = result;

  const full = ride.seats_left <= 0;
  const blockedReason = !ride.is_available ? "הנסיעה אינה זמינה" : full ? "הנסיעה מלאה" : null;
  const vehicle = [ride.vehicle_model, ride.vehicle_color].filter(Boolean).join(" ");

  return (
    <div className="detail-layout">
      <div className="detail-main">
        <BookingForm
          routeId={ride.route_id}
          date={ride.ride_date}
          price={ride.price}
          stops={stops}
          canBook={!blockedReason}
          blockedReason={blockedReason}
          alreadyBooked={Boolean(ride.my_booking_id)}
        />
      </div>
      <aside className="detail-side">
        <section className="driver-contact-card driver-info-card">
          <div className={`avatar avatar-${avatarColorFor(ride.driver_id)}`}>{initialsOf(ride.driver_name)}</div>
          <div><span>פרטי הנהגת</span><strong>{ride.driver_name}</strong></div>
          <div className="driver-contact-links">
            {ride.driver_phone && (
              <a href={`tel:${ride.driver_phone}`}><Phone {...iconProps} size={16} />{ride.driver_phone}</a>
            )}
            <a href={`mailto:${ride.driver_email}`}>{ride.driver_email}</a>
          </div>
        </section>
        <section className="panel detail-hero">
          <div className="trip-top detail-summary-top">
            <div className="ride-summary-title">
              <strong>פרטי הנסיעה</strong>
              <span>נסיעה {kindLabel(ride.kind)}</span>
            </div>
            {vehicle && (
              <div className="vehicle-chip">
                <Car {...iconProps} size={20} />
                <div><span>הרכב</span><strong>{vehicle}</strong></div>
              </div>
            )}
          </div>
          <div className="detail-route">
            <div><span>יציאה</span><h1>{ride.origin}</h1><small>{formatTime(ride.out_time)}</small></div>
            <div className="detail-route-line"><i></i><Car {...iconProps} size={20} /><i></i></div>
            <div>
              <span>יעד</span><h1>{ride.destination}</h1>
            </div>
          </div>
          <div className="detail-meta">
            <span><CalendarDays {...iconProps} size={20} /> {formatRideDate(ride.ride_date)}</span>
            <span><Users {...iconProps} size={20} /> {full ? "הנסיעה מלאה" : seatsText(ride.seats_left)}</span>
          </div>
        </section>
      </aside>
    </div>
  );
}
