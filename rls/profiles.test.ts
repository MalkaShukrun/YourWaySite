import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, DENIED, type World } from "./world";

// Profiles: users read and edit only their own, and never their admin flag
// or email (0001, 0006).

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(() => w?.cleanup());

async function isAdmin(id: string) {
  const { data } = await w.service.from("profiles").select("is_admin").eq("id", id).single();
  return data?.is_admin;
}

describe("a non-admin", () => {
  it("can't make themselves admin", async () => {
    const { error } = await w.passenger.db.from("profiles").update({ is_admin: true }).eq("id", w.passenger.id);
    expect(error?.code).toBe(DENIED);
    expect(await isAdmin(w.passenger.id)).toBe(false);
  });

  it("can't sneak the admin flag in with other fields", async () => {
    const { error } = await w.passenger.db
      .from("profiles")
      .update({ full_name: "Innocent", is_admin: true })
      .eq("id", w.passenger.id);
    expect(error?.code).toBe(DENIED);
    expect(await isAdmin(w.passenger.id)).toBe(false);
  });

  it("can't insert a profile with the admin flag", async () => {
    const { error } = await w.passenger.db.from("profiles").insert({ id: w.passenger.id, is_admin: true });
    expect(error?.code).toBe(DENIED);
  });

  it("isn't an admin to is_admin()", async () => {
    const { data } = await w.passenger.db.rpc("is_admin");
    expect(data).toBe(false);
  });

  it("can't change their email", async () => {
    const { error } = await w.passenger.db
      .from("profiles")
      .update({ email: "malkycohen1@gmail.com" })
      .eq("id", w.passenger.id);
    expect(error?.code).toBe(DENIED);
  });

  it("can edit their own name", async () => {
    const { data, error } = await w.passenger.db
      .from("profiles")
      .update({ full_name: "New Name" })
      .eq("id", w.passenger.id)
      .select("full_name");
    expect(error).toBeNull();
    expect(data).toEqual([{ full_name: "New Name" }]);
  });

  it("reads only their own profile", async () => {
    const { data } = await w.stranger.db.from("profiles").select("id");
    expect(data).toEqual([{ id: w.stranger.id }]);
  });

  it("can't read another user's phone", async () => {
    const { data } = await w.passenger.db.from("profiles").select("phone").eq("id", w.driver.id);
    expect(data).toEqual([]);
  });

  it("can't edit another user's profile", async () => {
    const { data } = await w.stranger.db
      .from("profiles")
      .update({ full_name: "Hacked" })
      .eq("id", w.driver.id)
      .select();
    expect(data).toEqual([]);
  });
});

describe("an admin", () => {
  it("reads every profile", async () => {
    const ids = [w.admin.id, w.driver.id, w.passenger.id, w.stranger.id];
    const { data } = await w.admin.db.from("profiles").select("id").in("id", ids);
    expect(data).toHaveLength(4);
  });

  it("still can't grant admin through the API", async () => {
    const { error } = await w.admin.db.from("profiles").update({ is_admin: true }).eq("id", w.stranger.id);
    expect(error?.code).toBe(DENIED);
    expect(await isAdmin(w.stranger.id)).toBe(false);
  });
});
