"use client";

import { SUPPORT_EMAIL } from "@/lib/support";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-content">
      <section className="panel empty-state">
        <strong>לא הצלחנו לטעון את הנתונים</strong>
        <span>
          {process.env.NODE_ENV === "development"
            ? "ייתכן שבסיס הנתונים עדיין לא הוגדר (הריצי את קבצי ה־SQL שב־supabase/migrations)."
            : <>משהו השתבש אצלנו. נסי שוב בעוד רגע, ואם זה חוזר כתבי לנו ל־<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</>}
        </span>
        <button className="btn btn-secondary" onClick={reset}>ניסיון חוזר</button>
      </section>
    </main>
  );
}
