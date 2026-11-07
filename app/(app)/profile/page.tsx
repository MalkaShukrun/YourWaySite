import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getDailyEmailValues, getProfileValues, getRideEmailsValues } from "@/lib/profile/data";
import { initialsOf } from "@/lib/utils/format";
import { DailyEmailForm } from "@/components/profile/DailyEmailForm";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { RideEmailsForm } from "@/components/profile/RideEmailsForm";

export const metadata: Metadata = { title: "הפרופיל שלי" };

// Personal profile (SRS §1.3): details, vehicle, the emails about her rides and the driver's daily email.
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
  const [defaults, rideEmails, dailyEmail] = await Promise.all([
    getProfileValues(user.id, user.fullName),
    getRideEmailsValues(user.id),
    getDailyEmailValues(user.id),
  ]);
  return (
    <>
      <ProfileForm initials={initialsOf(user.fullName) || "?"} email={user.email} defaults={defaults} />
      <RideEmailsForm email={user.email} defaults={rideEmails} />
      <DailyEmailForm email={user.email} defaults={dailyEmail} />
    </>
  );
}
