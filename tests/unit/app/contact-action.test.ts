import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/site/support";

// The contact form emails support through Resend (spec I1). fetch is replaced:
// these tests never send anything.

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user" })) }));
const { sendContactMessage } = await import("@/app/contact/actions");
const { requireUser } = await import("@/lib/auth/session");

const message = { name: " רחל ", email: "rachel@example.com", message: " שלום, יש לי שאלה " };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("CONTACT_TO_EMAIL", "");
  vi.stubEnv("CONTACT_FROM_EMAIL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe("sendContactMessage", () => {
  it("is for signed-in users only", async () => {
    await sendContactMessage(message);
    expect(requireUser).toHaveBeenCalled();
  });

  it("emails support, with her email as the reply address", async () => {
    expect(await sendContactMessage(message)).toEqual({});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(sent()).toEqual({
      from: "בדרך שלך <onboarding@resend.dev>",
      to: [SUPPORT_EMAIL],
      reply_to: "rachel@example.com",
      subject: "פנייה חדשה מ־רחל",
      text: "רחל <rachel@example.com>\n\nשלום, יש לי שאלה",
    });
  });

  it("uses the configured sender and recipient", async () => {
    vi.stubEnv("CONTACT_TO_EMAIL", "inbox@example.com");
    vi.stubEnv("CONTACT_FROM_EMAIL", "noreply@yourway.example");
    await sendContactMessage(message);
    expect(sent()).toMatchObject({ from: "בדרך שלך <noreply@yourway.example>", to: ["inbox@example.com"] });
  });

  it("shows a general error when sending fails", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    expect(await sendContactMessage(message)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
  });

  it("shows a general error, without calling Resend, when no key is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendContactMessage(message)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the form before sending", async () => {
    expect(await sendContactMessage({ ...message, email: "nope" })).toEqual({ error: "כתובת מייל לא תקינה" });
    expect(await sendContactMessage({ ...message, message: "היי" })).toEqual({ error: "לפחות 5 תווים" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // No limit on messages per user (spec I1, §8).
  it("sends every message, however many", async () => {
    for (let i = 0; i < 3; i++) await sendContactMessage(message);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
