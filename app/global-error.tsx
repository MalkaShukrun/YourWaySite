"use client";

import "./globals.css";

// An error in the root layout itself. It replaces that layout, so it brings its
// own <html>, styles and title; errors inside the signed-in area are caught
// earlier by app/(app)/error.tsx.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <title>משהו השתבש · בדרך שלך</title>
        <main className="legal-page">
          <section className="legal-card empty-state">
            <strong>משהו השתבש</strong>
            <span>לא הצלחנו לטעון את האתר. נסי שוב בעוד רגע.</span>
            <button className="btn btn-secondary" onClick={() => retry()}>ניסיון חוזר</button>
          </section>
        </main>
      </body>
    </html>
  );
}
