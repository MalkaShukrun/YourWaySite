import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata: Metadata = { title: "ניהול קבוצות · בדרך שלך" };

// Placeholder — group management (SRS §8) will be built here. Admins only.
export default function AdminGroupsPage() {
  return (
    <main className="page-content">
      <Suspense fallback={null}>
        <AdminWelcome />
      </Suspense>
    </main>
  );
}

async function AdminWelcome() {
  const user = await requireAdmin();
  return (
    <div className="welcome">
      <div>
        <p>אזור מנהלת מערכת · {user.fullName}</p>
        <h1>ניהול קבוצות נסיעה</h1>
      </div>
      <SignOutButton />
    </div>
  );
}
