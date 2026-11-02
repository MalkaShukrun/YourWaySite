import { describe, expect, it, vi } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/site/support";
import { buildEmail, type DailyEmail } from "@/supabase/functions/daily-passenger-email/email";
import { gmailSender } from "@/supabase/functions/daily-passenger-email/mailer";

// Sends both of the site's emails for real, to be checked by eye. The contact
// form goes to support's inbox through Resend. The daily email goes through
// Gmail (GMAIL_USER, GMAIL_APP_PASSWORD) to EMAIL_TEST_TO, or to support's inbox.

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user" })) }));
const { sendContactMessage } = await import("@/app/contact/actions");

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const dailyEmail: DailyEmail = {
  driver_id: "email-test",
  driver_name: "נהגת לבדיקה",
  driver_email: SUPPORT_EMAIL,
  ride_date: tomorrow,
  rides: [
    {
      origin: "ירושלים",
      destination: "בני ברק",
      out_time: "07:15",
      passengers: [
        { name: "נוסעת לבדיקה", phone: "050-000-0000", email: "passenger@example.test", pickup: "תחנה מרכזית" },
        { name: "אורחת לבדיקה", phone: "052-000-0000", email: null, pickup: "גבעת שאול" },
      ],
    },
  ],
};

describe("real emails", () => {
  it("sends the contact form", async () => {
    const result = await sendContactMessage({
      name: "בדיקה",
      email: SUPPORT_EMAIL,
      message: "הודעת בדיקה מטופס יצירת הקשר.",
    });
    expect(result).toEqual({});
  });

  it("sends the daily passenger email", async () => {
    const { subject, ...body } = buildEmail(dailyEmail, process.env.SITE_URL);
    const sendMail = gmailSender(process.env.GMAIL_USER ?? "", process.env.GMAIL_APP_PASSWORD ?? "");
    const to = process.env.EMAIL_TEST_TO || SUPPORT_EMAIL;
    const { accepted } = await sendMail({ to, subject: `[בדיקה] ${subject}`, ...body });
    expect(accepted).toEqual([to]);
  });
});
