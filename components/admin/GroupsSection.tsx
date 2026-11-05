import { Car, Route, UserCheck, Users } from "lucide-react";
import { activeRouteTotals, type AdminGroup, type Place } from "@/lib/admin/data";
import { GroupName } from "@/components/ui/PlaceName";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { StatCard } from "@/components/ui/StatCard";
import { GroupActions } from "@/components/admin/GroupActions";
import { GroupDialog } from "@/components/admin/GroupDialog";
import { carIconProps, iconProps } from "@/components/ui/icon";

// Ride group management (SRS §8) — stats and the group list from the design.
// Render only for admins (the caller checks with requireAdmin and loads the groups).
export function GroupsSection({ groups, places, users }: { groups: AdminGroup[]; places: Place[]; users: number }) {
  const active = activeRouteTotals(groups);

  return (
    <>
      <div className="admin-stats">
        <StatCard icon={<UserCheck {...iconProps} size={20} />} value={users} label="משתמשות במערכת" tone="purple" />
        <StatCard icon={<Car {...carIconProps} size={20} />} value={active.routes} label="מסלולים פעילים" tone="blue" />
        <StatCard icon={<Users {...iconProps} size={20} />} value={active.drivers} label="נהגות עם מסלולים" tone="purple" />
        <StatCard icon={<Route {...iconProps} size={20} />} value={groups.filter((g) => g.is_active).length} label="קבוצות פעילות" tone="green" />
      </div>

      <CollapsiblePanel title="כל הקבוצות" subtitle="רק מנהלת יכולה ליצור, לערוך או למחוק קבוצות" action={<GroupDialog places={places} />}>
        {groups.length === 0 ? (
          <div className="empty-state"><strong>עדיין אין קבוצות</strong><span>צרי את הקבוצה הראשונה — מוצא ויעד מרשימת המקומות.</span></div>
        ) : (
          groups.map((group) => {
            const activeRouteCount = group.routes.filter((r) => r.is_active).length;
            return (
              <div key={group.id} className={`group-row ${group.is_active ? "" : "is-hidden"}`}>
                <span className="route-badge"><Route {...iconProps} size={20} /></span>
                <div>
                  <strong><GroupName origin={group.origin} destination={group.destination} /></strong>
                  <span>{activeRouteCount === 0 ? "אין מסלולים פעילים" : activeRouteCount === 1 ? "מסלול פעיל אחד" : `${activeRouteCount} מסלולים פעילים`}</span>
                </div>
                <span className={`status-pill ${group.is_active ? "" : "danger"}`}><i></i>{group.is_active ? "פעילה" : "מוסתרת"}</span>
                <GroupActions
                  group={{ id: group.id, originId: group.origin_place_id, destinationId: group.destination_place_id }}
                  places={places}
                  active={group.is_active}
                  routeCount={group.routes.length}
                />
              </div>
            );
          })
        )}
      </CollapsiblePanel>
    </>
  );
}
