import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminGroups, getAdminStats } from "@/lib/admin/data";
import { AdminStatsSection } from "@/components/admin/AdminStatsSection";
import { GroupsSection } from "@/components/admin/GroupsSection";
import { GroupDialog } from "@/components/admin/GroupDialog";
import { OtpEmailsSection } from "@/components/admin/OtpEmailsSection";

export const metadata: Metadata = { title: "ניהול קבוצות" };

// Group management (SRS §8): only admins add, edit, hide or delete ride
// groups, so drivers pick from one consistent list.
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
  const [stats, groups] = await Promise.all([getAdminStats(), getAdminGroups()]);
  return (
    <>
      <div className="welcome">
        <div>
          <p>אזור מנהלת מערכת</p>
          <h1>ניהול קבוצות נסיעה</h1>
        </div>
        <GroupDialog />
      </div>
      <AdminStatsSection stats={stats} />
      <GroupsSection groups={groups} users={stats.users} />
      <OtpEmailsSection />
    </>
  );
}
