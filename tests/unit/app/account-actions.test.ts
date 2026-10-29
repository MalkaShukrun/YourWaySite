import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import type { ProfileValues } from "@/lib/validation/profile";
import { createSupabaseMock } from "../helpers/supabase-mock";
import { runAction } from "../helpers/run-action";
import { ID } from "../helpers/fixtures";

// Onboarding and sign-out (app/(auth)/login/actions.ts, spec A1, A5) and the
// profile screen (app/(app)/profile/actions.ts, spec A3).

const sb = vi.hoisted(() => ({
  mock: null as unknown as ReturnType<typeof createSupabaseMock>,
  user: null as null | { id: string; isAdmin: boolean; phone: string | null },
  cookies: [] as { name: string }[],
  deleted: [] as string[],
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("@/lib/auth/session", async () => ({
  getCurrentUser: vi.fn(async () => sb.user),
  requireUser: vi.fn(async () => sb.user),
  homePathFor: (user: { isAdmin: boolean }) => (user.isAdmin ? "/admin/groups" : "/"),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => sb.cookies, delete: (name: string) => sb.deleted.push(name) }),
}));
sb.mock = createSupabaseMock();
const { completeProfile, signOut } = await import("@/app/(auth)/login/actions");
const { saveProfile } = await import("@/app/(app)/profile/actions");

const values = (overrides: Partial<ProfileValues> = {}): ProfileValues => ({
  fullName: " רחל לוי ",
  phone: "050-123-4567",
  hasVehicle: false,
  vehicleModel: "",
  vehicleColor: "",
  vehicleSeats: "4",
  ...overrides,
});

beforeEach(() => {
  sb.mock.reset();
  sb.user = { id: ID.user, isAdmin: false, phone: null };
  sb.cookies = [];
  sb.deleted = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("completeProfile (onboarding, spec A1)", () => {
  it("saves the name and phone, and lands on search", async () => {
    sb.mock.onTable("profiles", { data: [{ id: ID.user }] });
    expect(await runAction(() => completeProfile(values()))).toEqual({ redirectedTo: "/" });
    expect(sb.mock.callsOn("profiles")).toEqual([
      ["update", [{ full_name: "רחל לוי", phone: "050-123-4567", vehicle_model: null, vehicle_color: null, vehicle_seats: null }]],
      ["eq", ["id", ID.user]],
      ["select", ["id"]],
    ]);
  });

  it("sends an admin to group management", async () => {
    sb.user = { id: ID.user, isAdmin: true, phone: null };
    sb.mock.onTable("profiles", { data: [{ id: ID.user }] });
    expect(await runAction(() => completeProfile(values()))).toEqual({ redirectedTo: "/admin/groups" });
  });

  it("saves the car when one is added", async () => {
    sb.mock.onTable("profiles", { data: [{ id: ID.user }] });
    await runAction(() => completeProfile(values({ hasVehicle: true, vehicleModel: "יונדאי", vehicleColor: "לבן", vehicleSeats: "5" })));
    expect(sb.mock.argsOf("profiles", "update")).toEqual([
      { full_name: "רחל לוי", phone: "050-123-4567", vehicle_model: "יונדאי", vehicle_color: "לבן", vehicle_seats: 5 },
    ]);
  });

  it("never sends the email: it always comes from Google (spec A3)", async () => {
    sb.mock.onTable("profiles", { data: [{ id: ID.user }] });
    await runAction(() => completeProfile(values()));
    expect(sb.mock.argsOf("profiles", "update")![0]).not.toHaveProperty("email");
  });

  it("creates the profile row when there isn't one yet", async () => {
    sb.mock.onTable("profiles", { data: [] }, { data: null });
    expect(await runAction(() => completeProfile(values()))).toEqual({ redirectedTo: "/" });
    expect(sb.mock.argsOf("profiles", "insert", 1)).toEqual([
      { id: ID.user, full_name: "רחל לוי", phone: "050-123-4567", vehicle_model: null, vehicle_color: null, vehicle_seats: null },
    ]);
  });

  it("sends a signed-out visitor to sign-in", async () => {
    sb.user = null;
    expect(await runAction(() => completeProfile(values()))).toEqual({ redirectedTo: "/login" });
  });

  it("refuses invalid details without saving", async () => {
    expect(await runAction(() => completeProfile(values({ phone: "123" })))).toEqual({
      error: "חלק מהפרטים אינם תקינים, נא לבדוק ולנסות שוב.",
    });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });

  it("shows a general message when saving fails", async () => {
    sb.mock.onTable("profiles", { error: { message: "down", code: "57P01" } });
    expect(await runAction(() => completeProfile(values()))).toEqual({ error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." });
  });

  it("hints the developer at the setup script when the table is missing, in development only", async () => {
    sb.mock.onTable("profiles", { error: { message: "missing", code: "PGRST205" } });
    vi.stubEnv("NODE_ENV", "development");
    expect(await runAction(() => completeProfile(values()))).toEqual({
      error: "בסיס הנתונים עדיין לא הוגדר — יש להריץ את supabase/setup.sql ב־Supabase.",
    });
    vi.stubEnv("NODE_ENV", "production");
    expect(await runAction(() => completeProfile(values()))).toEqual({ error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." });
  });
});

// Sign-out removes the session cookies even if Supabase already ended the session (spec A5).
describe("signOut", () => {
  it("signs out, deletes every session cookie and returns to sign-in", async () => {
    sb.cookies = [{ name: "sb-127-auth-token" }, { name: "sb-127-auth-token.0" }, { name: "theme" }];
    expect(await runAction(signOut)).toEqual({ redirectedTo: "/login" });
    expect(sb.mock.client.auth.signOut).toHaveBeenCalledOnce();
    expect(sb.deleted).toEqual(["sb-127-auth-token", "sb-127-auth-token.0"]);
  });

  it("still clears the cookies when Supabase refuses", async () => {
    sb.mock.client.auth.signOut.mockResolvedValueOnce({ error: { message: "refresh token already used" } } as never);
    sb.cookies = [{ name: "sb-127-auth-token" }];
    expect(await runAction(signOut)).toEqual({ redirectedTo: "/login" });
    expect(sb.deleted).toEqual(["sb-127-auth-token"]);
  });
});

describe("saveProfile (spec A3)", () => {
  it("saves and refreshes", async () => {
    expect(await saveProfile(values())).toEqual({});
    expect(sb.mock.callsOn("profiles")).toEqual([
      ["update", [{ full_name: "רחל לוי", phone: "050-123-4567", vehicle_model: null, vehicle_color: null, vehicle_seats: null }]],
      ["eq", ["id", ID.user]],
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removing the car clears all three car fields", async () => {
    await saveProfile(values({ hasVehicle: false, vehicleModel: "יונדאי", vehicleColor: "לבן", vehicleSeats: "5" }));
    expect(sb.mock.argsOf("profiles", "update")).toEqual([
      expect.objectContaining({ vehicle_model: null, vehicle_color: null, vehicle_seats: null }),
    ]);
  });

  it.each([
    [{ fullName: "א" }, "יש להזין שם מלא"],
    [{ phone: "" }, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"],
    [{ hasVehicle: true }, "יש להזין סוג רכב"],
  ])("shows the first problem with %o and saves nothing", async (overrides, message) => {
    expect(await saveProfile(values(overrides))).toEqual({ error: message });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });

  it("shows a general message when saving fails", async () => {
    sb.mock.onTable("profiles", { error: { message: "down" } });
    expect(await saveProfile(values())).toEqual({ error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." });
  });
});
