import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getDailyEmailValues, getProfileValues } from "@/lib/profile/data";
import { initialsOf } from "@/lib/utils/format";
import { DailyEmailForm } from "@/components/profile/DailyEmailForm";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata: Metadata = { title: "הפרופיל שלי" };

// Personal profile (SRS §1.3): details, vehicle, payment account and the driver's daily email.
export default function ProfilePage() {
  return (
    <main className="page-content">
      <div className="welcome"><div><p>הפרטים שלך</p><h1>הפרופיל שלי</h1></div></div>
      <Suspense fallback={null}>
        <Profile />
      </Suspense>
    </main>
  );
}

async function Profile() {
  const user = await requireUser();
  // The daily email is for admins only, for now (spec D7).
  const [defaults, dailyEmail] = await Promise.all([
    getProfileValues(user.id, user.fullName),
    user.isAdmin ? getDailyEmailValues(user.id) : null,
  ]);
  return (
    <>
      <ProfileForm initials={initialsOf(user.fullName) || "?"} email={user.email} defaults={defaults} />
      {dailyEmail && <DailyEmailForm email={user.email} defaults={dailyEmail} />}
    </>
  );
}
