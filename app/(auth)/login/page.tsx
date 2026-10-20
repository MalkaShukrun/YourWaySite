import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Car, Check, MapPin, Phone, Search } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { AuthRoadIllustration } from "@/components/auth/AuthRoadIllustration";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { OnboardingModal } from "@/components/auth/OnboardingModal";
import { getCurrentUser, homePathFor, needsOnboarding } from "@/lib/auth";

export const metadata: Metadata = { title: "התחברות · בדרך שלך" };

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="auth-page">
      <header className="landing-header">
        <Logo />
        <nav>
          <span>איך זה עובד</span>
          <span>לטרמפיסטית</span>
          <span>לנהגת</span>
        </nav>
        <a href="mailto:support@baderech.co.il">
          צריכה עזרה? <span>support@baderech.co.il</span>
        </a>
      </header>

      <div className="auth-brand">
        <div className="landing-preview">
          <div className="preview-head">
            <div>
              <span>הנסיעה הקרובה שלך</span>
              <h2>בית שמש ← ירושלים</h2>
            </div>
            <span className="preview-status"><i></i>מקום שמור</span>
          </div>
          <div className="preview-route-line">
            <span></span><i></i><Car {...iconProps} size={25} /><i></i><span></span>
          </div>
          <div className="preview-details">
            <div>
              <span className="preview-icon pickup"><MapPin {...iconProps} size={19} /></span>
              <div><small>תחנת איסוף</small><strong>נהר הירדן / רבי עקיבא</strong></div>
              <b>07:15</b>
            </div>
            <div>
              <span className="preview-icon dropoff"><MapPin {...iconProps} size={19} /></span>
              <div><small>תחנת הורדה</small><strong>בנייני האומה, ירושלים</strong></div>
            </div>
          </div>
          <div className="preview-driver">
            <div className="avatar avatar-lavender">רכ</div>
            <div><small>הנהגת שלך</small><strong>רחל כהן</strong></div>
            <span><Phone {...iconProps} size={17} /> 050-765-4321</span>
          </div>
          <div className="preview-footer">
            <span><strong>₪24</strong> מחיר הנסיעה</span>
            <span><strong>3</strong> מקומות פנויים</span>
          </div>
        </div>
        <AuthRoadIllustration />
      </div>

      <div className="auth-form">
        <div className="auth-card">
          <span className="mobile-auth-logo"><Logo /></span>
          <h1 className="mobile-auth-title">נוסעות יחד,<br />מגיעות רחוק</h1>
          <AuthRoadIllustration mobile />
          <span className="auth-form-eyebrow">קהילת הטרמפים לנשים</span>
          <h2>הדרך שלך.<br /><em>ביחד.</em></h2>
          <p>מוצאות טרמפ שמתאים בדיוק לדרך שלך, מתחברות לנהגות מהקהילה ומתאמות הכול בפשטות.</p>
          <div className="auth-role-pills">
            <span><Search {...iconProps} size={17} /> אני מחפשת טרמפ</span>
            <span><Car {...iconProps} size={17} /> אני מציעה נסיעה</span>
          </div>
          <GoogleButton />
          <Suspense fallback={null}>
            <LoginError searchParams={searchParams} />
          </Suspense>
          <div className="security-note">
            <Check {...iconProps} size={17} /> ההצטרפות קצרה והפרטים שלך נשמרים בצורה מאובטחת
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <span>© 2025 בדרך שלך</span>
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
    return <OnboardingModal defaultName={user.fullName} defaultEmail={user.email} />;
  }
  redirect(homePathFor(user));
}

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  if (!error) return null;
  return <p className="auth-error" role="alert">ההתחברות לא הושלמה. נסי שוב.</p>;
}
