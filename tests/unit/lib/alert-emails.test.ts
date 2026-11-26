import { describe, expect, it } from "vitest";
import { alertTitle, buildAlertEmail, type AlertEmail } from "@/supabase/functions/daily-passenger-email/alert-emails";

// The ride-alert email (spec A7, C10).

const ALERT_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_ID = "22222222-2222-4222-8222-222222222222";

const email = (overrides: Partial<AlertEmail> = {}): AlertEmail => ({
  alert_ids: [ALERT_ID],
  route_id: ROUTE_ID,
  to_name: "רחל",
  to_email: "rachel@example.test",
  ride: { origin: "ירושלים", destination: "בני ברק", out_time: "07:15", price: 15, driver_name: "דנה", dates: ["2026-11-02"] },
  alerts: [{ id: ALERT_ID, origins: "ירושלים (כל העיר)", destinations: "בני ברק, מרכז" }],
  ...overrides,
});

describe("buildAlertEmail", () => {
  it("has the ride, the seat note and the links", () => {
    const { subject, text, html } = buildAlertEmail(email(), "https://yourway.example/");
    expect(subject).toBe("נמצאה נסיעה מתאימה: ירושלים ← בני ברק");
    for (const body of [text, html]) {
      for (const value of [
        "רחל",
        "תאריך: יום שני, 2 בנובמבר",
        "שעת יציאה: 07:15",
        "₪15",
        "הנהגת: דנה",
        "כדאי לבדוק שעדיין יש מקום פנוי",
        `https://yourway.example/ride/${ROUTE_ID}?date=2026-11-02`,
        `alert=${ALERT_ID}`,
        "https://yourway.example/alerts",
        "https://yourway.example/alerts",
      ]) {
        expect(body).toContain(value);
      }
    }
    expect(text).toContain(`הסרת ההתראה: https://yourway.example/alerts?alert=${ALERT_ID}`);
  });

  it("lists every alert the ride matched, each with its own remove link", () => {
    const second = "33333333-3333-4333-8333-333333333333";
    const { text } = buildAlertEmail(
      email({
        alert_ids: [ALERT_ID, second],
        alerts: [
          { id: ALERT_ID, origins: "ירושלים", destinations: "בני ברק" },
          { id: second, origins: "ירושלים", destinations: "בני ברק", from_time: "07:00", until_time: "09:00" },
        ],
      }),
      "https://yourway.example",
    );
    expect(text).toContain("שמתאימה ל־2 מההתראות שלך");
    expect(text).toContain("ההתראות שהופעלו:");
    expect(text).toContain(`alert=${ALERT_ID}`);
    expect(text).toContain(`alert=${second}`);
  });

  it("lists the first 7 dates of a long range", () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 2).padStart(2, "0")}`);
    const { text } = buildAlertEmail(email({ ride: { ...email().ride, dates } }));
    expect(text).toContain("תאריכים: ");
    expect(text).toContain("ועוד 3");
    expect(text).not.toContain("9 בנובמבר");
  });

  it("escapes what users typed", () => {
    const { html } = buildAlertEmail(email({ to_name: "<b>", ride: { ...email().ride, driver_name: "<script>" } }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
  });

  it("says a seat opened, for a seat-opening email", () => {
    const { subject, text } = buildAlertEmail(email({ reason: "seat" }), "https://yourway.example");
    expect(subject).toBe("התפנה מקום בנסיעה: ירושלים ← בני ברק");
    expect(text).toContain("התפנה מקום בנסיעה שמתאימה להתראה שלך:");
    expect(text).toContain("המקום פנוי למי שנרשמת ראשונה");
    expect(text).not.toContain("ייתכן שהנסיעה התמלאה");
    expect(text).toContain(`https://yourway.example/ride/${ROUTE_ID}?date=2026-11-02`);
  });

  it("works without the site address", () => {
    const { text, html } = buildAlertEmail(email());
    expect(text).not.toContain("http");
    expect(html).not.toContain("href");
  });
});

describe("alertTitle", () => {
  const base = { id: ALERT_ID, origins: "א", destinations: "ב" };
  it("shows only the ranges the alert sets", () => {
    expect(alertTitle(base)).toBe("א ← ב");
    expect(alertTitle({ ...base, start_date: "2026-11-02", end_date: "2026-11-04" })).toBe(
      "א ← ב · יום שני, 2 בנובמבר – יום רביעי, 4 בנובמבר",
    );
    expect(alertTitle({ ...base, end_date: "2026-11-04" })).toBe("א ← ב · עד יום רביעי, 4 בנובמבר");
    expect(alertTitle({ ...base, from_time: "22:00", until_time: "02:00" })).toBe("א ← ב · 22:00 – 02:00");
    expect(alertTitle({ ...base, from_time: "07:00" })).toBe("א ← ב · מ־07:00");
  });
});
