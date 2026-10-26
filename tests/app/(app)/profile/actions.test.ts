import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import { createSupabaseMock } from "@/tests/supabase-mock";
import type { ProfileValues } from "@/lib/validation/profile";
import { saveProfile } from "@/app/(app)/profile/actions";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));

function profile(overrides: Partial<ProfileValues> = {}): ProfileValues {
  return {
    fullName: "מלכה כהן",
    phone: "050-123-4567",
    hasVehicle: true,
    vehicleModel: "טויוטה קורולה",
    vehicleColor: "לבן",
    vehicleSeats: "4",
    ...overrides,
  };
}

function savedRow() {
  const [[method, [row]], [eq, eqArgs]] = sb.callsOn("profiles") as [string, [Record<string, unknown>]][];
  expect(method).toBe("update");
  expect([eq, eqArgs]).toEqual(["eq", ["id", "user-1"]]);
  return row;
}

beforeEach(() => sb.reset());

describe("saveProfile", () => {
  it("saves the full profile for the signed-in user", async () => {
    expect(await saveProfile(profile())).toEqual({});
    expect(savedRow()).toEqual({
      full_name: "מלכה כהן",
      phone: "050-123-4567",
      vehicle_model: "טויוטה קורולה",
      vehicle_color: "לבן",
      vehicle_seats: 4,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("clears vehicle fields when the user has no car", async () => {
    await saveProfile(profile({ hasVehicle: false, vehicleModel: "ישן", vehicleColor: "", vehicleSeats: "" }));
    expect(savedRow()).toMatchObject({ vehicle_model: null, vehicle_color: null, vehicle_seats: null });
  });

  it("trims names before saving", async () => {
    await saveProfile(profile({ fullName: "  מלכה כהן  " }));
    expect(savedRow().full_name).toBe("מלכה כהן");
  });

  it.each([
    ["a short name", { fullName: "מ" }, "יש להזין שם מלא"],
    ["a bad phone", { phone: "12345" }, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"],
    ["a car without a model", { vehicleModel: "" }, "יש להזין סוג רכב"],
    ["a car without a colour", { vehicleColor: "" }, "יש להזין צבע"],
    ["a car with 9 seats", { vehicleSeats: "9" }, "בין 1 ל־8 מקומות"],
  ])("rejects %s", async (_name, overrides, message) => {
    expect(await saveProfile(profile(overrides))).toEqual({ error: message });
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it("returns a generic error when saving fails", async () => {
    sb.onTable("profiles", { error: { code: "XX000" } });
    expect(await saveProfile(profile())).toEqual({ error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." });
    expect(refresh).not.toHaveBeenCalled();
  });
});
