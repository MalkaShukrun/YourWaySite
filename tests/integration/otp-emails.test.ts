import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, createWorld, DENIED, type User, type World } from "./support/world";

// Sign-in with a personal code (spec A6, H4): who can see and change the list,
// the limit on attempts, and the sign-in itself.

let w: World;
let rachel: User;
let admin: User;
const listed: string[] = [];
const createdUsers: string[] = [];

const newEmail = () => `it-otp-${randomUUID().slice(0, 8)}@example.test`;

async function listEmail() {
  const email = newEmail();
  check(await w.service.from("otp_emails").insert({ email, code_hash: "salt:hash" }));
  listed.push(email);
  return email;
}

async function createUser(email: string) {
  const { data } = await w.service.auth.admin.createUser({ email, email_confirm: true });
  createdUsers.push(data.user!.id);
  return data.user!.id;
}

const attempt = async (email: string) => {
  const { data, error } = await w.service.rpc("claim_code_attempt", { p_email: email });
  expect(error).toBeNull();
  return data as string | null;
};

beforeAll(async () => {
  w = createWorld();
  [rachel, admin] = await Promise.all([w.user("Rachel"), w.user("Admin", { admin: true })]);
});
afterAll(async () => {
  await w.service.from("otp_emails").delete().in("email", listed);
  await Promise.all(createdUsers.map((id) => w.service.auth.admin.deleteUser(id)));
  await w?.cleanup();
});

describe("the list (spec H4)", () => {
  it("is read and cleared by admins", async () => {
    const email = await listEmail();
    expect(check(await admin.db.from("otp_emails").select("email").eq("email", email))).toEqual([{ email }]);
    check(await admin.db.from("otp_emails").delete().eq("email", email));
    expect(check(await w.service.from("otp_emails").select("email").eq("email", email))).toEqual([]);
  });

  it("is closed to everyone else", async () => {
    const email = await listEmail();
    expect(check(await rachel.db.from("otp_emails").select("email").eq("email", email))).toEqual([]);
    expect((await rachel.db.from("otp_emails").insert({ email: newEmail() })).error?.code).toBe(DENIED);
    expect((await w.anon.from("otp_emails").select("email")).error?.code).toBe(DENIED);
  });

  it("never shows or lets anyone write a code hash, admins included", async () => {
    const email = await listEmail();
    expect((await admin.db.from("otp_emails").select("code_hash")).error?.code).toBe(DENIED);
    expect((await admin.db.from("otp_emails").update({ code_hash: "x:y" }).eq("email", email)).error?.code).toBe(DENIED);
    expect((await admin.db.from("otp_emails").insert({ email: newEmail(), code_hash: "x:y" })).error?.code).toBe(DENIED);
  });
});

describe("claim_code_attempt (spec A6)", () => {
  it("is refused to the public key and to users", async () => {
    const email = await listEmail();
    expect((await w.anon.rpc("claim_code_attempt", { p_email: email })).error?.code).toBe(DENIED);
    expect((await rachel.db.rpc("claim_code_attempt", { p_email: email })).error?.code).toBe(DENIED);
  });

  it("returns nothing for an unlisted address", async () => {
    expect(await attempt(newEmail())).toBeNull();
  });

  it("stops after 10 attempts in an hour, and starts again the next hour", async () => {
    const email = await listEmail();
    for (let n = 0; n < 10; n++) expect(await attempt(email)).toBe("salt:hash");
    expect(await attempt(email)).toBeNull();

    const anHourAgo = new Date(Date.now() - 3_601_000).toISOString();
    check(await w.service.from("otp_emails").update({ attempts_from: anHourAgo }).eq("email", email));
    expect(await attempt(email)).toBe("salt:hash");
  });
});

describe("signing in (spec A6)", () => {
  it("makes a session for an admin-created user, with a profile awaiting onboarding", async () => {
    const email = newEmail();
    const id = await createUser(email);

    const link = await w.service.auth.admin.generateLink({ type: "magiclink", email });
    const { data, error } = await w.anon.auth.verifyOtp({ email, token: link.data.properties!.email_otp, type: "email" });
    expect(error).toBeNull();
    expect(data.user?.id).toBe(id);

    const profile = check(await w.service.from("profiles").select("full_name, phone, email").eq("id", id).single());
    expect(profile).toEqual({ full_name: "", phone: null, email });
    await w.anon.auth.signOut();
  });
});
