import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Route } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatRideDate, formatTime, israelNow } from "@/lib/utils/dates";
import { getMyBookings } from "@/lib/rides/data";
import type { MyBooking } from "@/lib/rides/types";
import { splitByDeparture } from "@/lib/rides/bookings";
import { formatPrice, groupLabel } from "@/lib/utils/format";
import { CancelBookingButton } from "@/components/passenger/CancelBookingButton";
import { DriverContact } from "@/components/passenger/DriverContact";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";

export const metadata: Metadata = { title: "הנסיעות שלי" };

// "My Rides" — upcoming bookings and ride history (SRS §4.3).
export default function MyRidesPage({ searchParams }: PageProps<"/my-rides">) {
  return (
    <main className="page-content">
      <div className="welcome"><div><h1>הנסיעות שלי</h1></div></div>
      <Suspense fallback={<section className="panel" aria-busy="true" />}>
        <MyRides searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MyRides({ searchParams }: Pick<PageProps<"/my-rides">, "searchParams">) {
  await requireUser();
  const [query, bookings] = await Promise.all([searchParams, getMyBookings()]);
  const tab = query.tab === "history" ? "history" : "upcoming";
  const now = (await israelNow()).getTime();
  const { upcoming, history } = splitByDeparture(bookings.filter((b) => b.status === "active"), now);
  const rows = tab === "history" ? history.reverse() : upcoming;

  return (
    <>
      <div className="activity-tabs">
        <Link href="/my-rides" className={tab === "upcoming" ? "active" : ""}>נסיעות קרובות</Link>
        <Link href="/my-rides?tab=history" className={tab === "history" ? "active" : ""}>היסטוריה</Link>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{tab === "history" ? "נסיעות קודמות" : "הנסיעות הקרובות שלי"}</h2>
            <span>פרטי הנסיעה והקשר עם הנהגת</span>
          </div>
          <span className="count-pill">{rows.length} נסיעות</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">
            <strong>{tab === "history" ? "עוד אין נסיעות קודמות" : "אין לך נסיעות קרובות"}</strong>
            {tab === "upcoming" && <Link className="btn btn-primary" href="/">מציאת נסיעה</Link>}
          </div>
        ) : (
          rows.map((booking) => <BookingRow key={booking.booking_id} booking={booking} upcoming={tab === "upcoming"} />)
        )}
      </section>
      <Toast
        message={query.booked === "1" ? "הנסיעה נוספה בהצלחה לנסיעות שלי" : query.cancelled === "1" ? "ההרשמה בוטלה והמקום התפנה" : ""}
      />
    </>
  );
}

function BookingRow({ booking, upcoming }: { booking: MyBooking; upcoming: boolean }) {
  return (
    <div className={`activity-row booking-row ${booking.ride_cancelled ? "row-cancelled" : ""}`}>
      <div className="activity-date">
        <strong>{formatTime(booking.out_time)}</strong>
        <span>{formatRideDate(booking.ride_date)}</span>
      </div>
      <div className="activity-route">
        <Route {...iconProps} size={20} />
        <div>
          <strong>{groupLabel(booking.origin, booking.destination)}</strong>
          <span>{formatPrice(booking.price)}</span>
        </div>
      </div>
      <div className="activity-stops">
        <div className="registered-stops">
          <span><i className="pickup-dot"></i>איסוף: {booking.pickup_label}</span>
          <span><i className="dropoff-dot"></i>הורדה: {booking.dropoff_label}</span>
        </div>
        {booking.ride_cancelled && <span className="status-pill danger"><i></i>הנהגת ביטלה את הנסיעה</span>}
      </div>
      <div className="row-actions">
        <DriverContact name={booking.driver_name} phone={booking.driver_phone} email={booking.driver_email} />
        {upcoming && !booking.ride_cancelled && (
          <CancelBookingButton bookingId={booking.booking_id} />
        )}
      </div>
    </div>
  );
}
