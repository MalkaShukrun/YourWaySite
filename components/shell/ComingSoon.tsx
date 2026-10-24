import { Suspense } from "react";
import { requireUser } from "@/lib/auth";

// Placeholder for screens that aren't built yet, so menu links don't 404.
export function ComingSoon({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="page-content">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <div className="welcome"><div><p>{subtitle}</p><h1>{title}</h1></div></div>
      <section className="panel empty-state">
        <strong>המסך הזה בבנייה</strong>
        <span>בקרוב יהיה אפשר להשתמש בו.</span>
      </section>
    </main>
  );
}

async function AuthGate() {
  await requireUser();
  return null;
}
