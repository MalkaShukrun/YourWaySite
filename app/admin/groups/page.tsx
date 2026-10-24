import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { GroupsSection } from "@/components/admin/GroupsSection";
import { GroupDialog } from "@/components/admin/GroupDialog";

export const metadata: Metadata = { title: "ניהול קבוצות · בדרך שלך" };

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
  return (
    <>
      <div className="welcome">
        <div>
          <p>אזור מנהלת מערכת</p>
          <h1>ניהול קבוצות נסיעה</h1>
        </div>
        <GroupDialog />
      </div>
      <GroupsSection />
    </>
  );
}
