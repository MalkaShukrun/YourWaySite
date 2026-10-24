import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";

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
  await requireAdmin();
  return (
    <>
      <div className="welcome">
        <div>
          <p>אזור מנהלת מערכת</p>
          <h1>ניהול קבוצות נסיעה</h1>
        </div>
      </div>
      <section className="panel empty-state">
        <strong>המסך הזה בבנייה</strong>
        <span>בקרוב יהיה אפשר ליצור, לערוך ולמחוק קבוצות נסיעה.</span>
      </section>
    </>
  );
}
