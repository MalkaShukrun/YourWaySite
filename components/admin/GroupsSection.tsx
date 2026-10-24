import { Car, Route, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { groupLabel } from "@/lib/ride-types";
import { StatCard } from "@/components/driver/TodayCard";
import { GroupActions } from "@/components/admin/GroupActions";

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

type AdminGroup = {
  id: string;
  origin: string;
  destination: string;
  is_active: boolean;
  routes: { driver_id: string; is_active: boolean }[];
};

// Ride group management (SRS §8) — stats and the group list from the design.
// Render only for admins (the caller checks with requireAdmin).
export async function GroupsSection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ride_groups")
    .select("id, origin, destination, is_active, routes(driver_id, is_active)")
    .order("origin")
    .order("destination");
  const groups = (data ?? []) as AdminGroup[];

  const activeRoutes = groups.flatMap((g) => g.routes.filter((r) => r.is_active));
  const drivers = new Set(activeRoutes.map((r) => r.driver_id)).size;

  return (
    <>
      <div className="admin-stats">
        <StatCard icon={<Route {...iconProps} size={20} />} value={groups.filter((g) => g.is_active).length} label="קבוצות פעילות" tone="green" />
        <StatCard icon={<Users {...iconProps} size={20} />} value={drivers} label="נהגות עם מסלולים" tone="purple" />
        <StatCard icon={<Car {...iconProps} size={20} />} value={activeRoutes.length} label="מסלולים פעילים" tone="blue" />
      </div>

      <section className="panel">
        <div className="panel-title">
          <div><h2>כל הקבוצות</h2><span>רק מנהלת יכולה ליצור, לערוך או למחוק קבוצות</span></div>
        </div>
        {groups.length === 0 ? (
          <div className="empty-state"><strong>עדיין אין קבוצות</strong><span>צרי את הקבוצה הראשונה — מוצא ויעד.</span></div>
        ) : (
          groups.map((group) => {
            const active = group.routes.filter((r) => r.is_active).length;
            return (
              <div key={group.id} className={`group-row ${group.is_active ? "" : "is-hidden"}`}>
                <span className="route-badge"><Route {...iconProps} size={20} /></span>
                <div>
                  <strong>{groupLabel(group.origin, group.destination)}</strong>
                  <span>{active === 0 ? "אין מסלולים פעילים" : active === 1 ? "מסלול פעיל אחד" : `${active} מסלולים פעילים`}</span>
                </div>
                <span className={`status-pill ${group.is_active ? "" : "danger"}`}><i></i>{group.is_active ? "פעילה" : "מוסתרת"}</span>
                <GroupActions
                  group={{ id: group.id, origin: group.origin, destination: group.destination }}
                  active={group.is_active}
                  routeCount={group.routes.length}
                />
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
