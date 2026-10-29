"use client";

import { SUPPORT_EMAIL } from "@/lib/site/support";

// retry() fetches the page's data again; reset() would only re-render what failed.
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="page-content">
      <section className="panel empty-state">
        <strong>לא הצלחנו לטעון את הנתונים</strong>
        <span>
          {process.env.NODE_ENV === "development"
            ? "ייתכן שבסיס הנתונים עדיין לא הוגדר (הריצי את קבצי ה־SQL שב־supabase/migrations)."
            : <>משהו השתבש אצלנו. נסי שוב בעוד רגע, ואם זה חוזר כתבי לנו ל־<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</>}
        </span>
        <button className="btn btn-secondary" onClick={() => retry()}>ניסיון חוזר</button>
      </section>
    </main>
  );
}
