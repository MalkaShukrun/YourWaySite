import { describe, expect, it } from "vitest";
import { contactSchema } from "@/lib/validation/contact";
import { groupSchema } from "@/lib/validation/group";
import { addPassengerSchema } from "@/lib/validation/passenger";
import { isUuid, ISO_DATE_PATTERN, PHONE_PATTERN, TIME_PATTERN } from "@/lib/validation/patterns";
import { profileSchema, type ProfileValues } from "@/lib/validation/profile";
import { ID } from "../../helpers/fixtures";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.message);

// Israeli phone format, e.g. 050-000-0000 (spec A1).
describe("phone pattern", () => {
  it.each(["050-123-4567", "0501234567", "050-1234567", "02-123-4567", "021234567", "077-123-4567"])("accepts %s", (phone) => {
    expect(PHONE_PATTERN.test(phone)).toBe(true);
  });

  it.each(["", "12345", "50-123-4567", "+972501234567", "050 123 4567", "050-123-456", "050-123-45678", "abc-def-ghij"])(
    "refuses %s",
    (phone) => {
      expect(PHONE_PATTERN.test(phone)).toBe(false);
    },
  );
});

describe("other patterns", () => {
  it("matches times HH:MM", () => {
    expect(TIME_PATTERN.test("07:15")).toBe(true);
    expect(TIME_PATTERN.test("24:00")).toBe(false);
  });

  it("matches the date shape YYYY-MM-DD", () => {
    expect(ISO_DATE_PATTERN.test("2026-11-01")).toBe(true);
    expect(ISO_DATE_PATTERN.test("2026-1-1")).toBe(false);
  });

  // Ids from the address are checked before they reach a query (spec C7).
  it("recognises ids", () => {
    expect(isUuid(ID.route)).toBe(true);
    expect(isUuid(ID.route.toUpperCase())).toBe(true);
    expect(isUuid("not-a-ride")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid([ID.route])).toBe(false);
  });
});

// Onboarding and profile (spec A1, A3).
describe("profileSchema", () => {
  const base: ProfileValues = {
    fullName: "רחל לוי",
    phone: "050-123-4567",
    hasVehicle: false,
    vehicleModel: "",
    vehicleColor: "",
    vehicleSeats: "4",
  };
  const check = (overrides: Partial<ProfileValues>) => messages(profileSchema.safeParse({ ...base, ...overrides }));

  it("accepts a name and phone without a car", () => {
    expect(check({})).toEqual([]);
  });

  it("needs a name of 2–60 characters", () => {
    expect(check({ fullName: " א " })).toEqual(["יש להזין שם מלא"]);
    expect(check({ fullName: "א".repeat(60) })).toEqual([]);
    expect(check({ fullName: "א".repeat(61) })).toEqual(["עד 60 תווים בשם"]);
  });

  it("refuses control characters in the name", () => {
    expect(check({ fullName: "רחל\tלוי" })).toEqual(["השם מכיל תווים לא חוקיים"]);
  });

  it("needs a valid phone", () => {
    expect(check({ phone: "" })).toEqual(["מספר טלפון לא תקין (לדוגמה 050-000-0000)"]);
    expect(check({ phone: " 050-123-4567 " })).toEqual([]);
  });

  it("ignores half-filled car details once the car is removed", () => {
    expect(check({ hasVehicle: false, vehicleModel: "", vehicleColor: "לבן", vehicleSeats: "x" })).toEqual([]);
  });

  // Vehicle details are all-or-nothing (spec A3).
  it("needs model, colour and 1–8 seats once a car is added", () => {
    expect(check({ hasVehicle: true })).toEqual(["יש להזין סוג רכב", "יש להזין צבע"]);
    expect(check({ hasVehicle: true, vehicleModel: "יונדאי", vehicleColor: "לבן", vehicleSeats: "9" })).toEqual(["בין 1 ל־8 מקומות"]);
    expect(check({ hasVehicle: true, vehicleModel: "יונדאי", vehicleColor: "לבן", vehicleSeats: "4" })).toEqual([]);
  });

  it("limits the model to 40 characters and the colour to 20", () => {
    expect(check({ hasVehicle: true, vehicleModel: "א".repeat(41), vehicleColor: "לבן" })).toEqual(["עד 40 תווים"]);
    expect(check({ hasVehicle: true, vehicleModel: "יונדאי", vehicleColor: "א".repeat(21) })).toEqual(["עד 20 תווים"]);
  });
});

// A passenger the driver adds by hand (spec D4).
describe("addPassengerSchema", () => {
  const base = { name: "שרה כהן", phone: "052-765-4321", pickupStopId: ID.pickup, dropoffStopId: ID.dropoff };
  const check = (overrides: Partial<typeof base>) => messages(addPassengerSchema.safeParse({ ...base, ...overrides }));

  it("accepts a name, phone and two stops", () => {
    expect(check({})).toEqual([]);
  });

  it("checks the name like a profile name", () => {
    expect(check({ name: "א" })).toEqual(["יש להזין שם מלא"]);
    expect(check({ name: "א".repeat(61) })).toEqual(["עד 60 תווים בשם"]);
    expect(check({ name: "שרה\nכהן" })).toEqual(["השם מכיל תווים לא חוקיים"]);
  });

  it("needs a valid phone and both stops", () => {
    expect(check({ phone: "123" })).toEqual(["מספר טלפון לא תקין (לדוגמה 050-000-0000)"]);
    expect(check({ pickupStopId: "" })).toEqual(["יש לבחור תחנת איסוף"]);
    expect(check({ dropoffStopId: "x" })).toEqual(["יש לבחור תחנת הורדה"]);
  });
});

// Ride groups (spec H1).
describe("groupSchema", () => {
  const check = (origin: string, destination: string) => messages(groupSchema.safeParse({ origin, destination }));

  it("accepts two different places of 2–40 characters", () => {
    expect(check("בית שמש", "ירושלים")).toEqual([]);
    expect(check("אב", "א".repeat(40))).toEqual([]);
  });

  it("refuses names that are too short or too long", () => {
    expect(check("א", "ירושלים")).toEqual(["לפחות 2 תווים"]);
    expect(check("בית שמש", "א".repeat(41))).toEqual(["עד 40 תווים"]);
  });

  it("refuses the same place twice, even with extra spaces", () => {
    expect(check("ירושלים", " ירושלים ")).toEqual(["היעד חייב להיות שונה מנקודת המוצא"]);
  });
});

// The contact form (spec I1).
describe("contactSchema", () => {
  const base = { name: "רחל", email: "rachel@example.com", message: "שלום, יש לי שאלה" };
  const check = (overrides: Partial<typeof base>) => messages(contactSchema.safeParse({ ...base, ...overrides }));

  it("accepts a name, email and message", () => {
    expect(check({})).toEqual([]);
  });

  it.each([
    [{ name: "א" }, "לפחות 2 תווים"],
    [{ name: "א".repeat(61) }, "עד 60 תווים"],
    [{ email: "not-an-email" }, "כתובת מייל לא תקינה"],
    [{ email: `${"a".repeat(115)}@x.com` }, "עד 120 תווים"],
    [{ message: "קצר" }, "לפחות 5 תווים"],
    [{ message: "א".repeat(2001) }, "עד 2000 תווים"],
  ])("refuses %o", (overrides, message) => {
    expect(check(overrides)).toEqual([message]);
  });
});
