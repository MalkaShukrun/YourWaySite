import { describe, expect, it, vi } from "vitest";
import { buildEmail, sendDailyEmails, type DailyEmail } from "@/supabase/functions/daily-passenger-email/email";

// The driver's daily email (spec D7): its content and what happens when a send fails.

const email = (overrides: Partial<DailyEmail> = {}): DailyEmail => ({
  driver_id: "driver-1",
  driver_name: "דנה",
  driver_email: "dana@example.test",
  ride_date: "2026-11-02",
  rides: [
    {
      origin: "ירושלים",
      destination: "בני ברק",
      out_time: "07:15",
      passengers: [
        { name: "רחל", phone: "050-123-4567", email: "rachel@example.test", pickup: "תחנה מרכזית" },
        { name: "אורחת", phone: "052-000-0000", email: null, pickup: "גבעת שאול" },
      ],
    },
  ],
  ...overrides,
});

describe("buildEmail", () => {
  it("lists each passenger's phone, email and boarding stop under the ride", () => {
    const { subject, text, html } = buildEmail(email());
    expect(subject).toContain("2 בנובמבר");
    expect(subject).toContain("יום שני");
    for (const body of [text, html]) {
      for (const value of ["07:15", "ירושלים", "רחל", "050-123-4567", "rachel@example.test", "תחנה מרכזית", "גבעת שאול"]) {
        expect(body).toContain(value);
      }
    }
  });

  it("says today, not tomorrow, when a retry after midnight sends it on the ride day", () => {
    expect(buildEmail(email()).subject).toMatch(/^הנוסעות שלך למחר,/);
    expect(buildEmail(email(), "", "2026-11-01").subject).toMatch(/^הנוסעות שלך למחר,/);
    expect(buildEmail(email(), "", "2026-11-02").subject).toMatch(/^הנוסעות שלך להיום,/);
  });

  it("shows a dash where a passenger has no email", () => {
    expect(buildEmail(email()).text).toContain("אורחת | טלפון: 052-000-0000 | דוא״ל: — |");
  });

  it("escapes what users typed in the HTML", () => {
    const rides = email().rides;
    rides[0].passengers[0].name = '<img src=x onerror="alert(1)">';
    const { html } = buildEmail(email({ rides, driver_name: "<b>דנה</b>" }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
  });

  it("links to the profile when the site address is known", () => {
    expect(buildEmail(email(), "https://yourway.example/").html).toContain('href="https://yourway.example/profile"');
    expect(buildEmail(email()).html).not.toContain("href");
  });
});

describe("sendDailyEmails", () => {
  const deps = (emails: DailyEmail[]) => ({
    claim: vi.fn(async () => emails),
    send: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    wait: vi.fn(async () => {}),
  });

  it("sends every claimed email and waits between them", async () => {
    const d = deps([email(), email({ driver_id: "driver-2" })]);
    expect(await sendDailyEmails(d)).toEqual({ sent: 2, failed: 0 });
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.wait).toHaveBeenCalledTimes(1);
    expect(d.release).not.toHaveBeenCalled();
  });

  it("releases a failed send so the next run retries it, and carries on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = email({ driver_id: "driver-2" });
    const d = deps([failing, email()]);
    d.send.mockRejectedValueOnce(new Error("Resend 429"));

    expect(await sendDailyEmails(d)).toEqual({ sent: 1, failed: 1 });
    expect(d.release).toHaveBeenCalledExactlyOnceWith(failing);
  });
});
