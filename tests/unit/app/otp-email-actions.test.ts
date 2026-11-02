import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import { createSupabaseMock } from "../helpers/supabase-mock";
import { ID } from "../helpers/fixtures";

// Sign-in with a personal code (spec A6, H4).

function adminClient() {
  const mock = createSupabaseMock();
  return Object.assign(mock.client, {
    mock,
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ error: null as null | { code: string; message: string } })),
        generateLink: vi.fn(async () => ({ data: { properties: { email_otp: "123456" } }, error: null as null | { message: string } })),
      },
    },
  });
}

const sb = vi.hoisted(() => ({
  mock: null as unknown as ReturnType<typeof createSupabaseMock>,
  admin: null as null | ReturnType<typeof adminClient>,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => sb.admin }));
vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(async () => ({ id: ID.user, isAdmin: true })),
  getCurrentUser: vi.fn(),
  homePathFor: vi.fn(),
}));
sb.mock = createSupabaseMock();
const verifyOtp = vi.fn(async () => ({ error: null as null | { message: string } }));
Object.assign(sb.mock.client.auth, { verifyOtp });
const { addOtpEmail, newOtpCode, removeOtpEmail } = await import("@/app/(app)/admin/actions");
const { signInWithCode } = await import("@/app/(auth)/login/actions");
const { requireAdmin } = await import("@/lib/auth/session");
const { checkCode, generateCode, hashCode } = await import("@/lib/auth/personal-code");

const WRONG_CODE = "המייל או הקוד שגויים.";
beforeEach(() => {
  sb.mock.reset();
  verifyOtp.mockClear();
  sb.admin = adminClient();
});

describe("personal codes", () => {
  it("are 8 digits, and only the right one matches its hash", () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{8}$/);
    const hash = hashCode(code);
    expect(hash).not.toContain(code);
    expect(checkCode(code, hash)).toBe(true);
    expect(checkCode("00000000", hash)).toBe(false);
    expect(checkCode(code, null)).toBe(false);
  });
});

describe("addOtpEmail (spec H4)", () => {
  it("creates a confirmed user, stores a hash, and gives the code to the admin", async () => {
    const result = await addOtpEmail(" Rachel@Example.test ");
    expect(result.code).toMatch(/^\d{8}$/);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(sb.admin?.auth.admin.createUser).toHaveBeenCalledWith({ email: "rachel@example.test", email_confirm: true });

    const [row] = sb.admin!.mock.argsOf("otp_emails", "insert") as [{ email: string; code_hash: string }];
    expect(row.email).toBe("rachel@example.test");
    expect(checkCode(result.code!, row.code_hash)).toBe(true);

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("lists an address that already has an account", async () => {
    sb.admin?.auth.admin.createUser.mockResolvedValue({ error: { code: "email_exists", message: "exists" } });
    expect((await addOtpEmail("rachel@example.test")).code).toBeTruthy();
  });

  it("lists nothing when the user can't be created", async () => {
    sb.admin?.auth.admin.createUser.mockResolvedValue({ error: { code: "unexpected_failure", message: "down" } });
    expect((await addOtpEmail("rachel@example.test")).error).toBeTruthy();
    expect(sb.admin?.from).not.toHaveBeenCalled();
  });

  it("refuses an address already on the list", async () => {
    sb.admin!.mock.onTable("otp_emails", { error: { message: "duplicate key", code: "23505" } });
    expect(await addOtpEmail("rachel@example.test")).toEqual({ error: "הכתובת הזו כבר ברשימה." });
  });

  it("refuses an invalid address without touching Supabase", async () => {
    expect(await addOtpEmail("not-an-email")).toEqual({ error: "כתובת מייל לא תקינה" });
    expect(sb.admin?.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("shows an error when the secret key is missing", async () => {
    sb.admin = null;
    expect((await addOtpEmail("rachel@example.test")).error).toBeTruthy();
  });
});

describe("newOtpCode (spec H4)", () => {
  it("replaces the hash and clears the attempts", async () => {
    sb.admin!.mock.onTable("otp_emails", { data: [{ email: "rachel@example.test" }] });
    const result = await newOtpCode("rachel@example.test");
    expect(requireAdmin).toHaveBeenCalledOnce();
    const [row] = sb.admin!.mock.argsOf("otp_emails", "update") as [{ code_hash: string; attempt_count: number }];
    expect(checkCode(result.code!, row.code_hash)).toBe(true);
    expect(row.attempt_count).toBe(0);
  });

  it("refuses an address that isn't listed", async () => {
    sb.admin!.mock.onTable("otp_emails", { data: [] });
    expect((await newOtpCode("stranger@example.test")).error).toBeTruthy();
  });
});

describe("removeOtpEmail (spec H4)", () => {
  it("is for admins and removes only that address", async () => {
    expect(await removeOtpEmail("rachel@example.test")).toEqual({});
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(sb.mock.argsOf("otp_emails", "eq")).toEqual(["email", "rachel@example.test"]);
  });
});

describe("signInWithCode (spec A6)", () => {
  const stored = (code: string) => sb.admin!.mock.onRpc("claim_code_attempt", { data: hashCode(code) });

  it("signs her in with the right code", async () => {
    stored("12345678");
    expect(await signInWithCode("Rachel@Example.test", "12345678")).toEqual({});
    expect(sb.admin?.rpc).toHaveBeenCalledWith("claim_code_attempt", { p_email: "rachel@example.test" });
    expect(verifyOtp).toHaveBeenCalledWith({ email: "rachel@example.test", token: "123456", type: "email" });
  });

  it("refuses a wrong code", async () => {
    stored("12345678");
    expect(await signInWithCode("rachel@example.test", "87654321")).toEqual({ error: WRONG_CODE });
    expect(sb.admin?.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it("gives the same error for an unlisted address and for too many attempts", async () => {
    sb.admin!.mock.onRpc("claim_code_attempt", { data: null });
    expect(await signInWithCode("stranger@example.test", "12345678")).toEqual({ error: WRONG_CODE });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a malformed code without counting an attempt", async () => {
    expect(await signInWithCode("rachel@example.test", "12")).toEqual({ error: WRONG_CODE });
    expect(sb.admin?.rpc).not.toHaveBeenCalled();
  });
});
