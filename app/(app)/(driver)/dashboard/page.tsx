import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Car, ChevronDown, MapPin, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatRideDate, formatWeekRange, greetingFor, isIsoDate, israelHour, israelToday, rideWeekOf } from "@/lib/dates";
import { getDriverDay } from "@/lib/driver";
import { firstNameOf } from "@/lib/format";
import { DashboardDatePicker } from "@/components/driver/DashboardDatePicker";
import { DriverRideCard } from "@/components/driver/DriverRideCard";
import { WeekDays } from "@/components/driver/WeekDays";
import { StatCard } from "@/components/ui/StatCard";
import { carIconProps, iconProps } from "@/components/ui/icon";

// Driver weekly dashboard (SRS §5.2): the rides of the week (Sunday–Saturday) that holds the chosen date.
// Days without rides are left out, so Saturday shows only when a ride falls on it.
export default function DriverDashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <main className="page-content">
      <Suspense fallback={<div className="welcome dashboard-welcome"><div><p>&nbsp;</p><h1>הנסיעות שלך</h1></div></div>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const user = await requireUser();
  const query = await searchParams;
  const [today, hour] = await Promise.all([israelToday(), israelHour()]);
  const date = isIsoDate(query.date) ? query.date : today;
  const week = rideWeekOf(date);
  const days = await Promise.all(week.map(async (day) => ({ day, rides: (await getDriverDay(day)).rides })));

  const active = days.flatMap((d) => d.rides).filter((r) => !r.cancelled);
  const booked = active.reduce((sum, r) => sum + r.booked, 0);
  const free = active.reduce((sum, r) => sum + Math.max(r.seats - r.booked, 0), 0);
  const pickupStops = new Set(active.flatMap((r) => r.passengers.map((p) => p.pickup_stop_id))).size;
  const rideDays = days.filter((d) => d.rides.length > 0);
  // Only today's rides start expanded; in a week without rides today, the chosen date (or the first ride day) opens instead.
  const openDay = [today, date].find((d) => rideDays.some((r) => r.day === d)) ?? rideDays[0]?.day;
  const actions = (
    <div className="dashboard-actions">
      <DashboardDatePicker value={date} display={formatWeekRange(week)} today={today} week={week} />
      <Link className="btn btn-primary" href="/routes/new"><Plus {...iconProps} size={20} /> נסיעה חדשה</Link>
    </div>
  );

  return (
    <>
      <div className="welcome dashboard-welcome">
        <div>
          <p>{greetingFor(hour)}, {firstNameOf(user.fullName)}</p>
          <h1>{week.includes(today) ? "הנסיעות שלך השבוע" : `הנסיעות שלך לשבוע ${formatWeekRange(week)}`}</h1>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={<Users {...iconProps} size={20} />} value={booked} label="טרמפיסטיות רשומות" tone="peach" />
        <StatCard icon={<Car {...carIconProps} size={20} />} value={free} label="מקומות פנויים" tone="green" />
        <StatCard icon={<MapPin {...iconProps} size={20} />} value={pickupStops} label="תחנות איסוף" tone="purple" />
        <StatCard icon={<CalendarDays {...iconProps} size={20} />} value={active.length} label="נסיעות השבוע" tone="blue" />
      </div>

      {rideDays.length === 0 ? (
        <>
          <div className="week-days-actions">{actions}</div>
          <section className="panel empty-state">
            <strong>אין לך נסיעות בשבוע הזה</strong>
            <span>הגדירי מסלול קבוע או נסיעה חד־פעמית כדי שטרמפיסטיות יוכלו להירשם.</span>
          </section>
        </>
      ) : (
        <WeekDays actions={actions}>{rideDays.map(({ day, rides }) => (
          <details className="week-day" key={day} open={day === openDay}>
            <summary className={`week-day-head ${day === today ? "today" : ""}`}>
              {formatRideDate(day)}{day === today && <span>היום</span>}
              <ChevronDown {...iconProps} size={20} className="week-day-chevron" />
            </summary>
            <div className="today-list">
              {rides.map((ride, i) => (
                <DriverRideCard key={ride.route_id} ride={ride} date={day} open={day === openDay && i === 0} />
              ))}
            </div>
          </details>
        ))}</WeekDays>
      )}
    </>
  );
}
