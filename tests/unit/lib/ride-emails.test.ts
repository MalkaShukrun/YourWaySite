import { describe, expect, it } from "vitest";
import { buildRideEmail, type RideEmail } from "@/supabase/functions/daily-passenger-email/ride-emails";

// Emails about a member's own rides (spec A7): what each kind says.

const ride = (overrides: Partial<RideEmail["rides"][number]> = {}): RideEmail["rides"][number] => ({
  ride_date: "2026-11-02",
  out_time: "07:15",
  origin: "ירושלים",
  destination: "בני ברק",
  pickup: "תחנה מרכזית",
  dropoff: "רחוב רבי עקיבא",
  ...overrides,
});

const email = (overrides: Partial<RideEmail> = {}): RideEmail => ({
  ids: [1],
  kind: "booked",
  to_name: "רחל",
  to_email: "rachel@example.test",
  rides: [ride({ price: 15, driver_name: "דנה", driver_phone: "050-123-4567" })],
  ...overrides,
});

describe("buildRideEmail", () => {
  it("a booking has the ride, her stops, the price and the driver's phone", () => {
    const { subject, text, html } = buildRideEmail(email());
    expect(subject).toBe("נרשמת לנסיעה: יום שני, 2 בנובמבר, 07:15");
    for (const body of [text, html]) {
      for (const value of ["רחל", "ירושלים ← בני ברק", "איסוף: תחנה מרכזית · הורדה: רחוב רבי עקיבא", "₪15", "דנה · טלפון: 050-123-4567"]) {
        expect(body).toContain(value);
      }
    }
  });

  it("several dates come in one email, each with its date", () => {
    const rides = [ride({ driver_name: "דנה" }), ride({ ride_date: "2026-11-03", driver_name: "דנה" })];
    const { subject, text } = buildRideEmail(email({ ids: [1, 2], rides }));
    expect(subject).toBe("נרשמת ל־2 נסיעות");
    expect(text).toContain("יום שני, 2 בנובמבר, 07:15 · ירושלים ← בני ברק");
    expect(text).toContain("יום שלישי, 3 בנובמבר, 07:15 · ירושלים ← בני ברק");
  });

  it("her cancellation leaves out what the database didn't send", () => {
    const { subject, text } = buildRideEmail(email({ kind: "cancelled", rides: [ride({ driver_name: "דנה" })] }));
    expect(subject).toBe("ההרשמה בוטלה: יום שני, 2 בנובמבר, 07:15");
    expect(text).toContain("והמקום התפנה");
    expect(text).toContain("הנהגת: דנה\n");
    expect(text).not.toContain("טלפון");
    expect(text).not.toContain("מחיר");
  });

  it("a date the driver cancelled says she won't be charged", () => {
    const { subject, text } = buildRideEmail(
      email({ kind: "ride_cancelled", rides: [ride({ driver_name: "דנה", driver_phone: "050-123-4567" })] }),
    );
    expect(subject).toBe("הנהגת ביטלה את הנסיעה: יום שני, 2 בנובמבר, 07:15");
    expect(text).toContain("לא תחויבי עליה");
    expect(text).toContain("050-123-4567");
  });

  it("the driver learns who cancelled and where she was to board, with a link to that day", () => {
    const { subject, text, html } = buildRideEmail(
      email({ kind: "passenger_cancelled", to_name: "דנה", rides: [ride({ passenger_name: "רחל" })] }),
      "https://yourway.example",
    );
    expect(subject).toBe("נוסעת ביטלה הרשמה: יום שני, 2 בנובמבר, 07:15");
    expect(text).toContain("הנוסעת: רחל · תחנת עלייה: תחנה מרכזית");
    expect(text).not.toContain("הורדה");
    expect(html).toContain('href="https://yourway.example/dashboard?date=2026-11-02"');
  });

  it("links to my rides and the profile when the site address is known", () => {
    const { html } = buildRideEmail(email(), "https://yourway.example/");
    expect(html).toContain('href="https://yourway.example/my-rides"');
    expect(html).toContain('href="https://yourway.example/profile"');
    expect(buildRideEmail(email()).html).not.toContain("href");
  });

  it("greets a member with no name without a gap", () => {
    expect(buildRideEmail(email({ to_name: "" })).text).toMatch(/^שלום,/);
  });

  it("escapes what users typed in the HTML", () => {
    const rides = [ride({ pickup: '<img src=x onerror="alert(1)">', driver_name: "<b>דנה</b>" })];
    const { html } = buildRideEmail(email({ rides, to_name: "<i>רחל</i>" }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
  });
});
