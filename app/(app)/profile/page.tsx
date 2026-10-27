import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProfileValues } from "@/lib/profile";
import { initialsOf } from "@/lib/format";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata: Metadata = { title: "הפרופיל שלי · בדרך שלך" };

// Personal profile (SRS §1.3): details, vehicle and payment account.
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
  const defaults = await getProfileValues(user.id, user.fullName);
  return <ProfileForm initials={initialsOf(user.fullName) || "?"} email={user.email} defaults={defaults} />;
}
