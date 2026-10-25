import { Suspense } from "react";
import { Route } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatRideDate, formatTime, israelNow, israelToday, recentMonths } from "@/lib/dates";
import { getMyBookings, getMyDriversBank } from "@/lib/rides";
import { isCharged } from "@/lib/bookings";
import { formatPrice, groupLabel } from "@/lib/format";
import { DriverContact } from "@/components/passenger/DriverContact";
import { MonthFilter } from "@/components/passenger/MonthFilter";
import { PaidToggle } from "@/components/passenger/PaidToggle";

// Personal payment journal (SRS §4.3). Payment isn't processed in the app —
// the passenger marks each ride as paid herself.
export default function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  return (
    <main className="page-content">
      <div className="welcome"><div><h1>מעקב תשלומים</h1></div></div>
      <Suspense fallback={<section className="panel" aria-busy="true" />}>
        <Payments searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Payments({ searchParams }: Pick<PageProps<"/payments">, "searchParams">) {
  await requireUser();
  const [query, bookings, banks] = await Promise.all([searchParams, getMyBookings(), getMyDriversBank()]);
  const months = recentMonths(await israelToday());
  const month = typeof query.month === "string" && months.includes(query.month) ? query.month : months[0];

  const now = (await israelNow()).getTime();
  const charged = bookings.filter((b) => isCharged(b, now));
  const rows = charged.filter((b) => b.ride_date.startsWith(month));
  const total = rows.reduce((sum, b) => sum + Number(b.price), 0);
  const paid = rows.filter((b) => b.is_paid).reduce((sum, b) => sum + Number(b.price), 0);

  // Outstanding balance per driver, across all months.
  const balances = new Map<string, { name: string; owed: number }>();
  for (const b of charged) {
    if (b.is_paid) continue;
    const entry = balances.get(b.driver_id) ?? { name: b.driver_name, owed: 0 };
    entry.owed += Number(b.price);
    balances.set(b.driver_id, entry);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div><h2>סיכום תשלומים אישי</h2><span>נסיעה נכנסת לכאן אחרי שעת היציאה · הסימון אישי ואינו נשלח לנהגת</span></div>
          <MonthFilter months={months} value={month} />
        </div>
        <div className="payment-summary">
          <div><span>סה״כ החודש</span><strong>{formatPrice(total)}</strong></div>
          <div><span>שולם</span><strong className="green-text">{formatPrice(paid)}</strong></div>
          <div><span>נותר לתשלום</span><strong>{formatPrice(total - paid)}</strong></div>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state"><strong>אין נסיעות לתשלום בחודש הזה</strong></div>
        ) : (
          rows.map((b) => (
            <div className="activity-row" key={b.booking_id}>
              <div className="activity-date payment-date">
                <strong>{formatRideDate(b.ride_date)}</strong>
                <span>שעה {formatTime(b.out_time)}</span>
              </div>
              <div className="activity-route">
                <Route className="icon" size={20} strokeWidth={1.8} />
                <div>
                  <strong>{groupLabel(b.origin, b.destination)}</strong>
                  {b.status === "late_cancelled" && <small>בוטלה באיחור · נשמרה ביומן</small>}
                </div>
              </div>
              <PaidToggle bookingId={b.booking_id} isPaid={b.is_paid} price={formatPrice(b.price)} />
              <div className="row-actions">
                <DriverContact name={b.driver_name} phone={b.driver_phone} email={b.driver_email} bank={banks.get(b.driver_id) ?? null} />
              </div>
            </div>
          ))
        )}
      </section>

      {balances.size > 0 && (
        <section className="panel driver-balances">
          <div className="panel-title">
            <div><h2>יתרה לפי נהגת</h2><span>סכומים שעדיין לא סימנת כשולמו, בכל החודשים</span></div>
          </div>
          {[...balances].map(([driverId, entry]) => (
            <div className="balance-row" key={driverId}>
              <strong>{entry.name}</strong>
              <span>{formatPrice(entry.owed)}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
