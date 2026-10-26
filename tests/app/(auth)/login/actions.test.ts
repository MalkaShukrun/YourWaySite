import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { runAction } from "@/tests/redirect";
import { getCurrentUser } from "@/lib/auth";
import type { OnboardingValues } from "@/lib/validation/profile";
import { completeProfile, signOut } from "@/app/(auth)/login/actions";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));

const user = { id: "user-1", email: "a@example.com", fullName: "", phone: null, isAdmin: false };

function onboarding(overrides: Partial<OnboardingValues> = {}): OnboardingValues {
  return {
    fullName: "מלכה כהן",
    phone: "0501234567",
    hasVehicle: false,
    vehicleModel: "",
    vehicleColor: "",
    vehicleSeats: "",
    ...overrides,
  };
}

beforeEach(() => {
  sb.reset();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});

describe("completeProfile", () => {
  it("sends signed-out visitors to /login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect(await runAction(() => completeProfile(onboarding()))).toEqual({ redirectedTo: "/login" });
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it("updates the existing profile without the email (the database sets it) and goes home", async () => {
    sb.onTable("profiles", { data: [{ id: "user-1" }] });

    expect(await runAction(() => completeProfile(onboarding()))).toEqual({ redirectedTo: "/" });
    expect(sb.callsOn("profiles")).toEqual([
      [
        "update",
        [
          {
            full_name: "מלכה כהן",
            phone: "0501234567",
            vehicle_model: null,
            vehicle_color: null,
            vehicle_seats: null,
          },
        ],
      ],
      ["eq", ["id", "user-1"]],
      ["select", ["id"]],
    ]);
    expect(sb.queries).toHaveLength(1);
  });

  it("sends admins to the admin home", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, isAdmin: true });
    sb.onTable("profiles", { data: [{ id: "user-1" }] });
    expect(await runAction(() => completeProfile(onboarding()))).toEqual({ redirectedTo: "/admin/groups" });
  });

  it("saves vehicle details for drivers", async () => {
    sb.onTable("profiles", { data: [{ id: "user-1" }] });
    await runAction(() =>
      completeProfile(onboarding({ hasVehicle: true, vehicleModel: "מאזדה 3", vehicleColor: "אפור", vehicleSeats: "4" })),
    );
    expect(sb.callsOn("profiles")[0][1][0]).toMatchObject({ vehicle_model: "מאזדה 3", vehicle_color: "אפור", vehicle_seats: 4 });
  });

  it("creates the profile row when none exists yet", async () => {
    sb.onTable("profiles", { data: [] }, { error: null });

    expect(await runAction(() => completeProfile(onboarding()))).toEqual({ redirectedTo: "/" });
    expect(sb.callsOn("profiles", 1)).toEqual([
      ["insert", [expect.objectContaining({ id: "user-1", full_name: "מלכה כהן" })]],
    ]);
    expect(sb.callsOn("profiles", 1)[0][1][0]).not.toHaveProperty("email");
  });

  it("rejects invalid details", async () => {
    expect(await completeProfile(onboarding({ phone: "abc" }))).toEqual({
      error: "חלק מהפרטים אינם תקינים, נא לבדוק ולנסות שוב.",
    });
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it("rejects a car without seats", async () => {
    expect(await completeProfile(onboarding({ hasVehicle: true, vehicleModel: "x", vehicleColor: "y" }))).toEqual({
      error: "חלק מהפרטים אינם תקינים, נא לבדוק ולנסות שוב.",
    });
  });

  it.each(["PGRST205", "42P01"])("asks to run setup.sql when the table is missing (%s)", async (code) => {
    sb.onTable("profiles", { error: { code } });
    expect(await runAction(() => completeProfile(onboarding()))).toEqual({
      error: "בסיס הנתונים עדיין לא הוגדר — יש להריץ את supabase/setup.sql ב־Supabase.",
    });
  });

  it("reports a failed insert", async () => {
    sb.onTable("profiles", { data: [] }, { error: { code: "23505" } });
    expect(await runAction(() => completeProfile(onboarding()))).toEqual({
      error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע.",
    });
  });
});

describe("signOut", () => {
  it("signs out and goes to /login", async () => {
    expect(await runAction(() => signOut())).toEqual({ redirectedTo: "/login" });
    expect(sb.client.auth.signOut).toHaveBeenCalledOnce();
  });
});
