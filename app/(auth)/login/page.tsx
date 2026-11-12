import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Car, Check, MapPin, Search } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { BrandTicket } from "@/components/auth/BrandTicket";
import { SignInOptions } from "@/components/auth/SignInOptions";
import { OnboardingModal } from "@/components/auth/OnboardingModal";
import { SiteStats } from "@/components/auth/SiteStats";
import { getCurrentUser, homePathFor, needsOnboarding } from "@/lib/auth/session";
import { IDLE_REASON } from "@/lib/auth/idle";
import { carIconProps, iconProps } from "@/components/ui/icon";

export const metadata: Metadata = { title: "התחברות", alternates: { canonical: "/login" } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="auth-page">
      <span className="bsd">בס&quot;ד</span>
      <header className="landing-header">
        <Logo />
      </header>

      <section className="auth-brand" aria-label="על בדרך שלך">
        <div className="brand-copy">
          <span className="brand-eyebrow">טרמפים בקהילה, בין נשים</span>
          <h1>נוסעות יחד,<br /><em>מגיעות רחוק.</em></h1>
          <p>נהגות מפרסמות את הנסיעות שלהן, טרמפיסטיות נרשמות בלחיצה — והכול מתואם במקום אחד.</p>
        </div>

        <BrandTicket />

        <ol className="brand-steps">
          <li><span><Search {...iconProps} size={19} /></span><div><strong>מוצאות נסיעה</strong><small>לפי מסלול, יום ושעה</small></div></li>
          <li><span><MapPin {...iconProps} size={19} /></span><div><strong>בוחרות תחנה</strong><small>איסוף והורדה מהמפה של הנהגת</small></div></li>
          <li><span><Check {...iconProps} size={19} /></span><div><strong>נרשמות בלחיצה</strong><small>ומשלמות ישירות לנהגת</small></div></li>
        </ol>
      </section>

      <div className="auth-form">
        <div className="auth-card">
          <span className="mobile-auth-logo"><Logo /></span>
          <h1 className="mobile-auth-title">נוסעות יחד,<br />מגיעות רחוק</h1>
          <div className="mobile-ticket-panel"><BrandTicket /></div>
          <span className="auth-form-eyebrow">קהילת הטרמפים לנשים</span>
          <h2>הדרך שלך.<br /><em>ביחד.</em></h2>
          <p>מוצאות טרמפ שמתאים בדיוק לדרך שלך, מתחברות לנהגות מהקהילה ומתאמות הכול בפשטות.</p>
          <div className="auth-role-pills">
            <span><Search {...iconProps} size={17} /> אני מחפשת טרמפ</span>
            <span><Car {...carIconProps} size={17} /> אני מציעה נסיעה</span>
          </div>
          <SignInOptions />
          <Suspense fallback={null}>
            <LoginError searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <SiteStats />
        </Suspense>
      </div>

      <footer className="landing-footer">
        <span>© 2026 Your Way</span>
        <strong>נוסעות יחד, מגיעות רחוק.</strong>
      </footer>

      <Suspense fallback={null}>
        <SessionGate />
      </Suspense>
    </div>
  );
}

// Already signed in? Finish onboarding, or go straight to the role's home.
async function SessionGate() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (needsOnboarding(user)) {
    return <OnboardingModal defaultName={user.fullName} />;
  }
  redirect(homePathFor(user));
}

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error, reason } = await searchParams;
  if (reason === IDLE_REASON) {
    return (
      <p className="auth-error" role="status">
        התנתקת אוטומטית אחרי 10 דקות ללא פעילות. אפשר להתחבר שוב.
      </p>
    );
  }
  if (!error) return null;
  // The reason itself isn't shown: anyone can put text in the URL. The auth
  // callback logs the real reason on the server.
  return (
    <p className="auth-error" role="alert">
      ההתחברות לא הושלמה. נסי שוב.
    </p>
  );
}
