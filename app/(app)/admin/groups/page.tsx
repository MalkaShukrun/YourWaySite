import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminGroups, getAdminStats, getPlaces } from "@/lib/admin/data";
import { AdminStatsSection } from "@/components/admin/AdminStatsSection";
import { GroupsSection } from "@/components/admin/GroupsSection";
import { GroupDialog } from "@/components/admin/GroupDialog";
import { PlacesSection } from "@/components/admin/PlacesSection";
import { OtpEmailsSection } from "@/components/admin/OtpEmailsSection";

export const metadata: Metadata = { title: "ניהול קבוצות" };

// Group management (SRS §8): only admins add, edit, hide or delete ride
// groups, so drivers pick from one consistent list. Each group goes from one
// place on the admins' list of places to another.
export default function AdminGroupsPage() {
  return (
    <main className="page-content">
      <Suspense fallback={<div className="welcome"><div><p>אזור מנהלת מערכת</p><h1>ניהול קבוצות נסיעה</h1></div></div>}>
        <AdminGroups />
      </Suspense>
    </main>
  );
}

async function AdminGroups() {
  await requireAdmin();
  const [stats, groups, places] = await Promise.all([getAdminStats(), getAdminGroups(), getPlaces()]);
  return (
    <>
      <div className="welcome">
        <div>
          <p>אזור מנהלת מערכת</p>
          <h1>ניהול קבוצות נסיעה</h1>
        </div>
        <GroupDialog places={places} />
      </div>
      <AdminStatsSection stats={stats} />
      <GroupsSection groups={groups} places={places} users={stats.users} />
      <PlacesSection places={places} groups={groups} />
      <OtpEmailsSection />
    </>
  );
}
