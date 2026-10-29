import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECK_FAILED, createWorld, DENIED, uniquePhone, type User, type World } from "./support/world";

// Accounts and profiles (spec §1, A1, A3, §5): the profile made at sign-up,
// who can read and change it, and the admin flag.

let w: World;
let rachel: User;
let other: User;
let admin: User;

beforeAll(async () => {
  w = createWorld();
  [rachel, other, admin] = await Promise.all([w.user("Rachel"), w.user("Other"), w.user("Admin", { admin: true })]);
});
afterAll(() => w?.cleanup());

describe("sign-up (spec A1)", () => {
  it("creates a profile with the Google name and email, and no phone yet", async () => {
    const { id, email } = await w.signUp({ full_name: "רחל לוי" });
    const { data } = await w.service.from("profiles").select("full_name, email, phone, is_admin").eq("id", id).single();
    expect(data).toEqual({ full_name: "רחל לוי", email, phone: null, is_admin: false });
  });

  it("uses Google's 'name' when there's no full name", async () => {
    const { id } = await w.signUp({ name: "שרה" });
    const { data } = await w.service.from("profiles").select("full_name").eq("id", id).single();
    expect(data!.full_name).toBe("שרה");
  });

  it("cuts a name longer than 60 characters to 60, and drops control characters", async () => {
    const { id } = await w.signUp({ full_name: `ר\tחל ${"א".repeat(80)}` });
    const { data } = await w.service.from("profiles").select("full_name").eq("id", id).single();
    expect(data!.full_name).toHaveLength(60);
    expect(data!.full_name.startsWith("רחל ")).toBe(true);
  });

  // public_stats counts members who finished sign-up, i.e. saved a phone.
  it("doesn't count a user as a member until she saves a phone", async () => {
    const count = async () => Number(((await w.anon.rpc("public_stats").single()).data as { members: number }).members);
    const before = await count();
    const { id } = await w.signUp({ full_name: "חדשה" });
    expect(await count()).toBe(before);
    await w.service.from("profiles").update({ phone: uniquePhone() }).eq("id", id);
    expect(await count()).toBe(before + 1);
  });
});

describe("reading profiles (spec §5)", () => {
  it("a user reads her own profile", async () => {
    const { data } = await rachel.db.from("profiles").select("id, phone").eq("id", rachel.id).single();
    expect(data).toEqual({ id: rachel.id, phone: rachel.phone });
  });

  it("a user can't read another user's profile", async () => {
    const { data } = await rachel.db.from("profiles").select("id").eq("id", other.id);
    expect(data).toEqual([]);
  });

  it("an admin can read every profile", async () => {
    const { data } = await admin.db.from("profiles").select("id").in("id", [rachel.id, other.id]);
    expect(data).toHaveLength(2);
  });

  it("signed-out visitors read nothing", async () => {
    const { data } = await w.anon.from("profiles").select("id").eq("id", rachel.id);
    expect(data ?? []).toEqual([]);
  });
});

describe("changing a profile (spec A3)", () => {
  it("a user changes her name, phone and car", async () => {
    const phone = uniquePhone();
    const { error } = await rachel.db
      .from("profiles")
      .update({ full_name: "רחל כהן", phone, vehicle_model: "יונדאי", vehicle_color: "לבן", vehicle_seats: 5 })
      .eq("id", rachel.id);
    expect(error).toBeNull();
    const { data } = await w.service.from("profiles").select("full_name, phone, vehicle_seats").eq("id", rachel.id).single();
    expect(data).toEqual({ full_name: "רחל כהן", phone, vehicle_seats: 5 });
    rachel.phone = phone;
  });

  it("a user can't change another user's profile", async () => {
    const { data } = await rachel.db.from("profiles").update({ full_name: "Hacked" }).eq("id", other.id).select();
    expect(data ?? []).toEqual([]);
    const { data: row } = await w.service.from("profiles").select("full_name").eq("id", other.id).single();
    expect(row!.full_name).toBe("Other");
  });

  // Being an admin is set in the database and can't be set from the app (spec §1).
  it("a user can't make herself an admin", async () => {
    const { error } = await rachel.db.from("profiles").update({ is_admin: true }).eq("id", rachel.id);
    expect(error?.code).toBe(DENIED);
  });

  it("the email can't be edited: it always comes from the sign-in", async () => {
    const { error } = await rachel.db.from("profiles").update({ email: "fake@example.test" }).eq("id", rachel.id);
    expect(error?.code).toBe(DENIED);
    const { data } = await w.service.from("profiles").select("email").eq("id", rachel.id).single();
    expect(data!.email).toBe(rachel.email);
  });

  it.each([
    ["a phone in the wrong format", { phone: "12345" }],
    ["a name over 60 characters", { full_name: "א".repeat(61) }],
    ["control characters in the name", { full_name: "רחל\nלוי" }],
    ["a car model over 40 characters", { vehicle_model: "א".repeat(41) }],
    ["a colour over 20 characters", { vehicle_color: "א".repeat(21) }],
    ["9 seats in the car", { vehicle_seats: 9 }],
  ])("the database refuses %s, even sent directly", async (_name, patch) => {
    const { error } = await rachel.db.from("profiles").update(patch).eq("id", rachel.id);
    expect(error?.code).toBe(CHECK_FAILED);
  });
});
