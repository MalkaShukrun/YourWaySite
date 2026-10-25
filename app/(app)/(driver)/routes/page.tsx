import { Suspense } from "react";
import Link from "next/link";
import { Clock, MapPin, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatRideDate, formatTime } from "@/lib/dates";
import { formatPrice, groupLabel, routeKindLabel, weekdaysLabel } from "@/lib/format";
import { getMyRoutes } from "@/lib/driver";
import type { DriverRoute } from "@/lib/driver-types";
import { ArchiveRouteButton } from "@/components/driver/ArchiveRouteButton";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";

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
  const [routes, query] = await Promise.all([getMyRoutes(user.id), searchParams]);

  return (
    <>
      {routes.length === 0 ? (
        <section className="panel empty-state">
          <strong>עדיין לא הגדרת מסלולים</strong>
          <span>הגדירי מסלול קבוע או נסיעה חד־פעמית, עם תחנות איסוף והורדה על המפה.</span>
        </section>
      ) : (
        <div className="routes-grid">
          {routes.map((route) => <RouteCard key={route.id} route={route} />)}
        </div>
      )}
      <Toast message={query.saved === "1" ? "המסלול נשמר ופורסם" : ""} />
    </>
  );
}

function RouteCard({ route }: { route: DriverRoute }) {
  return (
    <article className="route-card">
      <div className="map-placeholder">
        <div className="map-road road-a"></div>
        <div className="map-road road-b"></div>
        <span className="map-pin pin-a"><MapPin {...iconProps} size={17} /></span>
        <span className="map-pin pin-b"><MapPin {...iconProps} size={17} /></span>
      </div>
      <div className="route-card-body">
        <div className="trip-top">
          <span className={`trip-type ${route.kind === "one_time" ? "special" : ""}`}>
            {routeKindLabel(route.kind)}
          </span>
          <span>{route.kind === "recurring" ? weekdaysLabel(route.weekdays) : route.ride_date && formatRideDate(route.ride_date)}</span>
        </div>
        <h2>{groupLabel(route.origin, route.destination)}</h2>
        <p>
          <Clock {...iconProps} size={17} /> יציאה ב־{formatTime(route.out_time)}
        </p>
        <p><Users {...iconProps} size={17} /> {route.seats} מקומות · {formatPrice(route.price)} לטרמפיסטית</p>
        <div className="route-actions">
          <ArchiveRouteButton routeId={route.id} />
          <Link className="btn btn-secondary" href={`/routes/${route.id}`}>עריכת מסלול</Link>
        </div>
      </div>
    </article>
  );
}
