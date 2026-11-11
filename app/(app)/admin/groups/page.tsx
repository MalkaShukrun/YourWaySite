import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminGroups, getAdminStats, getDailyStats, getEmailStats, getPlaces, getUpcomingPassengers } from "@/lib/admin/data";
import { AdminStatsSection, EmailStatsSection } from "@/components/admin/AdminStatsSection";
import { DailyChartsSection } from "@/components/admin/DailyChartsSection";
import { UpcomingPassengersSection } from "@/components/admin/UpcomingPassengersSection";
import { GroupsSection, GroupStats } from "@/components/admin/GroupsSection";
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
  const [stats, emailStats, upcoming, days, groups, places] = await Promise.all([
    getAdminStats(),
    getEmailStats(),
    getUpcomingPassengers(),
    getDailyStats(),
    getAdminGroups(),
    getPlaces(),
  ]);
  return (
    <>
      <div className="welcome">
        <div>
          <p>אזור מנהלת מערכת</p>
          <h1>ניהול קבוצות נסיעה</h1>
        </div>
      </div>
      <AdminStatsSection stats={stats} />
      <GroupStats groups={groups} users={stats.users} />
      <EmailStatsSection stats={emailStats} />
      <UpcomingPassengersSection days={upcoming} />
      <DailyChartsSection days={days} />
      <GroupsSection groups={groups} places={places} />
      <PlacesSection places={places} groups={groups} />
      <OtpEmailsSection />
    </>
  );
}
