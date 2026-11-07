import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, createWorld, DENIED, type User, type World } from "./support/world";

// The admin page's count of who has each email on (0045). Each test checks the
// change in the counts, since the database holds other tests' data.

type Stats = { ride_emails: number; daily_email: number; daily_email_updates: number };

let w: World;
let admin: User;

const stats = async () => check(await admin.db.rpc("admin_email_stats").single<Stats>());

async function changeFrom(before: Stats) {
  const after = await stats();
  return Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key as keyof Stats]]));
}

const none = { ride_emails: 0, daily_email: 0, daily_email_updates: 0 };

async function setEmails(user: User, columns: Record<string, boolean>) {
  check(await w.service.from("profiles").update(columns).eq("id", user.id));
}

beforeAll(async () => {
  w = createWorld();
  admin = await w.user("Admin", { admin: true });
});
afterAll(() => w?.cleanup());

describe("email switches (0045)", () => {
  it("counts a new member's ride emails, which are on until she turns them off", async () => {
    const before = await stats();
    const member = await w.user("Member");
    expect(await changeFrom(before)).toEqual({ ...none, ride_emails: 1 });
    await setEmails(member, { ride_emails_enabled: false });
    expect(await changeFrom(before)).toEqual(none);
  });

  it("counts a driver's daily email, and its updates only while the daily email is on", async () => {
    const driver = await w.user("Driver");
    const before = await stats();
    await setEmails(driver, { daily_email_enabled: true, daily_email_updates_enabled: true });
    expect(await changeFrom(before)).toEqual({ ...none, daily_email: 1, daily_email_updates: 1 });
    await setEmails(driver, { daily_email_enabled: false });
    expect(await changeFrom(before)).toEqual(none);
  });

  it("leaves out members who haven't finished sign-up", async () => {
    const before = await stats();
    const unfinished = await w.user("Unfinished", { phone: null });
    await setEmails(unfinished, { daily_email_enabled: true });
    expect(await changeFrom(before)).toEqual(none);
  });

  it("is for admins only", async () => {
    const member = await w.user("Other");
    expect(check(await member.db.rpc("admin_email_stats"))).toEqual([]);
    expect((await w.anon.rpc("admin_email_stats")).error?.code).toBe(DENIED);
  });
});
