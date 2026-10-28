import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedirectError } from "@/tests/setup";
import { runAction } from "@/tests/redirect";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: () => requireUser() }));

const { sendContactMessage } = await import("@/app/contact/actions");

const message = { name: "מלכה", email: "malka@example.com", message: "שלום, יש לי שאלה" };
const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue({ id: "user-1" });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendContactMessage", () => {
  it("sends the message for a signed-in user", async () => {
    expect(await sendContactMessage(message)).toEqual({});
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends signed-out visitors to /login without emailing", async () => {
    requireUser.mockRejectedValue(new RedirectError("/login"));
    expect(await runAction(() => sendContactMessage(message))).toEqual({ redirectedTo: "/login" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid message without emailing", async () => {
    expect(await sendContactMessage({ ...message, email: "not-an-email" })).toEqual({ error: "כתובת מייל לא תקינה" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
