import { describe, expect, it } from "vitest";
import {
  FULL_NAME_MAX,
  profileSchema,
  VEHICLE_COLOR_MAX,
  VEHICLE_MODEL_MAX,
  type ProfileValues,
} from "@/lib/validation/profile";
import { groupSchema, PLACE_MAX } from "@/lib/validation/group";

const valid: ProfileValues = {
  fullName: "מלכה כהן",
  phone: "050-123-4567",
  hasVehicle: true,
  vehicleModel: "טויוטה קורולה",
  vehicleColor: "לבן",
  vehicleSeats: "4",
};

function issues(overrides: Partial<ProfileValues>) {
  const result = profileSchema.safeParse({ ...valid, ...overrides });
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("profileSchema", () => {
  it("accepts a valid profile", () => {
    expect(issues({})).toEqual([]);
  });

  it.each([
    ["fullName", FULL_NAME_MAX, `עד ${FULL_NAME_MAX} תווים בשם`],
    ["vehicleModel", VEHICLE_MODEL_MAX, `עד ${VEHICLE_MODEL_MAX} תווים`],
    ["vehicleColor", VEHICLE_COLOR_MAX, `עד ${VEHICLE_COLOR_MAX} תווים`],
  ] as const)("accepts %s up to %i characters, and rejects a longer one", (field, max, message) => {
    expect(issues({ [field]: "א".repeat(max) })).toEqual([]);
    expect(issues({ [field]: "א".repeat(max + 1) })).toEqual([message]);
  });

  it("rejects a name with control characters", () => {
    expect(issues({ fullName: "מלכה\nכהן" })).toEqual(["השם מכיל תווים לא חוקיים"]);
  });

  it.each(["050-123-4567", "0501234567", "02-123-4567"])("accepts the phone %s", (phone) => {
    expect(issues({ phone })).toEqual([]);
  });

  it.each(["123", "+972501234567", "050-123-4567 x", "05O-123-4567"])("rejects the phone %j", (phone) => {
    expect(issues({ phone })).toEqual(["מספר טלפון לא תקין (לדוגמה 050-000-0000)"]);
  });
});

describe("groupSchema", () => {
  it("accepts names up to the limit, and rejects longer ones", () => {
    expect(groupSchema.safeParse({ origin: "א".repeat(PLACE_MAX), destination: "ירושלים" }).success).toBe(true);
    expect(groupSchema.safeParse({ origin: "א".repeat(PLACE_MAX + 1), destination: "ירושלים" }).success).toBe(false);
  });
});
