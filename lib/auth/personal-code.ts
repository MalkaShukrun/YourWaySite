import "server-only";
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

// The permanent sign-in code of a user without Google. It works like a
// password, so only a salted hash is stored.

export function generateCode() {
  return String(randomInt(10_000_000, 100_000_000));
}

export function hashCode(code: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(code, salt, 32).toString("hex")}`;
}

// Hashes the code even with nothing to compare it to (stored is null), so the
// reply takes as long and its timing doesn't show who is on the list.
export function checkCode(code: string, stored: string | null) {
  const [salt, hash] = (stored ?? `00:${"00".repeat(32)}`).split(":");
  const matches = timingSafeEqual(scryptSync(code, salt, 32), Buffer.from(hash, "hex"));
  return stored !== null && matches;
}
