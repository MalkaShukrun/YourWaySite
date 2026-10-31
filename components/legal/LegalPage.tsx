import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { iconProps } from "@/components/ui/icon";

type Props = { title: string; updated: string; children: ReactNode };

// The frame of the public legal pages, linked from the login screen.
export function LegalPage({ title, updated, children }: Props) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Logo />
        <Link className="back-link" href="/login">
          <ArrowLeft {...iconProps} size={17} /> חזרה להתחברות
        </Link>
      </header>

      <main className="legal-card">
        <h1>{title}</h1>
        <p className="legal-updated">עודכן לאחרונה: {updated}</p>
        {children}
      </main>
    </div>
  );
}
