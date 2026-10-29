import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = { title: "הדף לא נמצא" };

// Any unknown address, and every notFound() — e.g. a ride id that doesn't exist.
// Public, so it uses the privacy page's layout rather than the signed-in shell.
export default function NotFound() {
  return (
    <div className="legal-page">
      <header className="legal-header"><Logo /></header>
      <main className="legal-card empty-state">
        <strong>הדף לא נמצא</strong>
        <span>ייתכן שהקישור שגוי, או שהנסיעה כבר לא קיימת.</span>
        <Link className="btn btn-primary" href="/">חזרה לדף הבית</Link>
      </main>
    </div>
  );
}
