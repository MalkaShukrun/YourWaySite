import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Clock, Copy, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/session";
import { formatRideDate, formatTime, israelNow } from "@/lib/utils/dates";
import { formatPrice, routeKindLabel, weekdaysLabel } from "@/lib/utils/format";
import { getMyRoutes, routeTab } from "@/lib/driver/data";
import type { DriverRoute } from "@/lib/driver/types";
import { ArchiveRouteButton } from "@/components/driver/ArchiveRouteButton";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { GroupName } from "@/components/ui/PlaceName";

export const metadata: Metadata = { title: "המסלולים שלי" };

// Route management (SRS §5.1).
export default function DriverRoutesPage({ searchParams }: PageProps<"/routes">) {
  return (
    <main className="page-content">
      <div className="welcome">
        <div><p>הנסיעות הקבועות שלך</p><h1>המסלולים שלי</h1></div>
        <Link className="btn btn-primary" href="/routes/new"><Plus {...iconProps} size={20} /> הוספת מסלול</Link>
      </div>
      <Suspense fallback={<div className="routes-grid" aria-busy="true" />}>
        <Routes searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Routes({ searchParams }: Pick<PageProps<"/routes">, "searchParams">) {
  const user = await requireUser();
  const [routes, query, israel] = await Promise.all([getMyRoutes(user.id), searchParams, israelNow()]);
  const now = format(israel, "yyyy-MM-dd HH:mm");
  const tab = query.tab === "history" || query.tab === "cancelled" ? query.tab : "active";
  // Cancelled one-time rides have their own tab; the others whose date and departure time
  // have passed move to the history. Both show the latest ride first. Active routes keep
  // the newest created first, as getMyRoutes returns them.
  const rows = routes.filter((r) => routeTab(r, now) === tab);
  if (tab !== "active") {
    rows.sort((a, b) => `${b.ride_date} ${b.out_time}`.localeCompare(`${a.ride_date} ${a.out_time}`));
  }

  return (
    <>
      <div className="activity-tabs">
        <Link href="/routes" className={tab === "active" ? "active" : ""}>מסלולים פעילים</Link>
        <Link href="/routes?tab=history" className={tab === "history" ? "active" : ""}>היסטוריה</Link>
        <Link href="/routes?tab=cancelled" className={tab === "cancelled" ? "active" : ""}>מסלולים מבוטלים</Link>
      </div>
      {rows.length === 0 ? (
        <section className="panel empty-state">
          {tab === "history" ? (
            <strong>עוד אין נסיעות שהתקיימו</strong>
          ) : tab === "cancelled" ? (
            <strong>אין מסלולים מבוטלים</strong>
          ) : (
            <>
              <strong>אין לך מסלולים פעילים</strong>
              <span>הגדירי מסלול קבוע או נסיעה חד־פעמית, עם תחנות איסוף והורדה על המפה.</span>
            </>
          )}
        </section>
      ) : (
        <div className="routes-grid">
          {rows.map((route) => <RouteCard key={route.id} route={route} tab={tab} />)}
        </div>
      )}
      <Toast message={query.saved === "1" ? "המסלול נשמר ופורסם" : ""} />
    </>
  );
}

// A ride that took place or was cancelled is kept for the record: it can't be
// removed or given more stops. Every ride can be copied into a new one.
function RouteCard({ route, tab }: { route: DriverRoute; tab: "active" | "history" | "cancelled" }) {
  const copyLink = (
    <Link className="btn btn-secondary" href={`/routes/new?copy=${route.id}`}><Copy {...iconProps} size={18} /> שכפול נסיעה</Link>
  );
  return (
    <article className="route-card">
      <div className="route-card-body">
        <div className="trip-top">
          <span className={`trip-type ${route.kind === "one_time" ? "special" : ""}`}>
            {routeKindLabel(route.kind)}
          </span>
        </div>
        <h2><GroupName origin={route.origin} destination={route.destination} /></h2>
        <p>
          <CalendarDays {...iconProps} size={19} />
          {route.kind === "recurring"
            ? `${weekdaysLabel(route.weekdays)}${route.ride_date ? ` · החל מ${formatRideDate(route.ride_date)}` : ""}`
            : route.ride_date && formatRideDate(route.ride_date)}
        </p>
        <p>
          <Clock {...iconProps} size={19} /> יציאה ב־{formatTime(route.out_time)}
        </p>
        <p><Users {...iconProps} size={19} /> {route.seats} מקומות · {formatPrice(route.price)} לטרמפיסטית</p>
        {tab === "active" && (
          <div className="route-actions">
            <ArchiveRouteButton routeId={route.id} />
            <div className="route-actions-group">
              {copyLink}
              <Link className="btn btn-secondary" href={`/routes/${route.id}`}>עריכת מסלול</Link>
            </div>
          </div>
        )}
        {tab !== "active" && <div className="route-actions">{copyLink}</div>}
      </div>
    </article>
  );
}
