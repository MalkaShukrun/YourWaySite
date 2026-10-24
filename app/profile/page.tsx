import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { initialsOf } from "@/lib/ride-types";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata: Metadata = { title: "הפרופיל שלי · בדרך שלך" };

// Personal profile (SRS §1.3): details, vehicle and payment account.
export default function ProfilePage() {
  return (
    <main className="page-content">
      <div className="welcome"><div><p>הפרטים שלך</p><h1>הפרופיל שלי</h1></div></div>
      <Suspense fallback={<section className="panel profile-panel" aria-busy="true" />}>
        <Profile />
      </Suspense>
    </main>
  );
}

async function Profile() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <>
      <ProfileForm
        initials={initialsOf(user.fullName) || "?"}
        email={user.email}
        defaults={{
          fullName: p?.full_name ?? user.fullName,
          phone: p?.phone ?? "",
          hasVehicle: Boolean(p?.vehicle_model),
          vehicleModel: p?.vehicle_model ?? "",
          vehicleColor: p?.vehicle_color ?? "",
          vehicleSeats: p?.vehicle_seats ? String(p.vehicle_seats) : "4",
          bankAccountName: p?.bank_account_name ?? "",
          bankName: p?.bank_name ?? "",
          bankBranch: p?.bank_branch ?? "",
          bankAccount: p?.bank_account ?? "",
        }}
      />
    </>
  );
}
