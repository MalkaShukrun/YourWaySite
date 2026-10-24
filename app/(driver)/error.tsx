"use client";

export default function DriverError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-content">
      <section className="panel empty-state">
        <strong>לא הצלחנו לטעון את הנתונים</strong>
        <span>ייתכן שבסיס הנתונים עדיין לא הוגדר (הריצי את קבצי ה־SQL שב־supabase/migrations).</span>
        <button className="btn btn-secondary" onClick={reset}>ניסיון חוזר</button>
      </section>
    </main>
  );
}
