import { Suspense } from "react";
import Link from "next/link";
import { Car, Clock, MapPin, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatRideDate, formatTime, greetingFor, isIsoDate, israelHour, israelToday } from "@/lib/dates";
import { getDriverDay } from "@/lib/driver";
import { DashboardDatePicker } from "@/components/driver/DashboardDatePicker";
import { StatCard, TodayCard } from "@/components/driver/TodayCard";

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

// Driver daily dashboard (SRS §5.2).
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
  const { rides } = await getDriverDay(date);

  const active = rides.filter((r) => !r.cancelled);
  const booked = active.reduce((sum, r) => sum + r.booked, 0);
  const free = active.reduce((sum, r) => sum + Math.max(r.seats - r.booked, 0), 0);
  const pickupStops = new Set(active.flatMap((r) => r.passengers.map((p) => p.pickup_stop_id))).size;
  const firstOut = active[0] ? formatTime(active[0].out_time) : "—";

  return (
    <>
      <div className="welcome dashboard-welcome">
        <div>
          <p>{greetingFor(hour)}, {user.fullName.split(/\s+/)[0]}</p>
          <h1>{date === today ? "הנסיעות שלך להיום" : `הנסיעות שלך ל${formatRideDate(date)}`}</h1>
        </div>
        <div className="dashboard-actions">
          <DashboardDatePicker value={date} label={formatRideDate(date)} today={today} />
          <Link className="btn btn-primary" href="/routes/new"><Plus {...iconProps} size={20} /> נסיעה חדשה</Link>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={<Users {...iconProps} size={20} />} value={booked} label="טרמפיסטיות רשומות" tone="peach" />
        <StatCard icon={<Car {...iconProps} size={20} />} value={free} label="מקומות פנויים" tone="green" />
        <StatCard icon={<MapPin {...iconProps} size={20} />} value={pickupStops} label="תחנות איסוף" tone="purple" />
        <StatCard icon={<Clock {...iconProps} size={20} />} value={firstOut} label="שעת יציאה" tone="blue" />
      </div>

      {rides.length === 0 ? (
        <section className="panel empty-state">
          <strong>אין לך נסיעות בתאריך הזה</strong>
          <span>הגדירי מסלול קבוע או נסיעה חד־פעמית כדי שטרמפיסטיות יוכלו להירשם.</span>
        </section>
      ) : (
        <div className="today-list">
          {rides.map((ride) => (
            <TodayCard key={ride.route_id} ride={ride} date={date} />
          ))}
        </div>
      )}
    </>
  );
}
