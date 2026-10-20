import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/SignOutButton";

// Placeholder — the ride search screen (SRS §4.1) will be built here.
export default function PassengerHomePage() {
  return (
    <main className="page-content">
      <Suspense fallback={<div className="welcome"><div><h1>בואי נמצא לך טרמפ</h1></div></div>}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const user = await requireUser();
  return (
    <div className="welcome">
      <div>
        <p>שלום, {user.fullName}</p>
        <h1>בואי נמצא לך טרמפ</h1>
      </div>
      <SignOutButton />
    </div>
  );
}
