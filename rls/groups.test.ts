import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, DENIED, type World } from "./world";

// Ride groups (SRS §8): everyone signed in reads them, only admins write.

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(() => w?.cleanup());

async function groupOrigin() {
  const { data } = await w.service.from("ride_groups").select("origin").eq("id", w.groupId).single();
  return data?.origin;
}

describe("a non-admin", () => {
  it("can read groups", async () => {
    const { data, error } = await w.passenger.db.from("ride_groups").select("id").eq("id", w.groupId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("can't create a group", async () => {
    const { error } = await w.passenger.db.from("ride_groups").insert({ origin: "Hacked", destination: "Group" });
    expect(error?.code).toBe(DENIED);
  });

  it("can't rename a group", async () => {
    const before = await groupOrigin();
    const { data, error } = await w.passenger.db
      .from("ride_groups")
      .update({ origin: "Hacked" })
      .eq("id", w.groupId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await groupOrigin()).toBe(before);
  });

  it("can't hide or delete a group", async () => {
    const hide = await w.driver.db.from("ride_groups").update({ is_active: false }).eq("id", w.groupId).select();
    expect(hide.data).toEqual([]);
    const del = await w.driver.db.from("ride_groups").delete().eq("id", w.groupId).select();
    expect(del.data).toEqual([]);
    expect(await groupOrigin()).toBeDefined();
  });
});

describe("signed out", () => {
  it("sees no groups", async () => {
    const { data } = await w.anon.from("ride_groups").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("can't create a group", async () => {
    const { error } = await w.anon.from("ride_groups").insert({ origin: "Hacked", destination: "Anon" });
    expect(error).not.toBeNull();
  });
});

// Proves the denials above come from the admin check, not a broken table.
describe("an admin", () => {
  it("creates, renames and deletes a group", async () => {
    const created = await w.admin.db
      .from("ride_groups")
      .insert({ origin: `Admin ${w.groupId.slice(0, 8)}`, destination: "Test" })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;

    const renamed = await w.admin.db.from("ride_groups").update({ destination: "Renamed" }).eq("id", id).select();
    expect(renamed.data).toHaveLength(1);

    const deleted = await w.admin.db.from("ride_groups").delete().eq("id", id).select();
    expect(deleted.data).toHaveLength(1);
  });
});
