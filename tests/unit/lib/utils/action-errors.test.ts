import { describe, expect, it } from "vitest";
import { z } from "zod";
import { firstIssue, GENERIC_ERROR, messageForCode } from "@/lib/utils/action-errors";

describe("messageForCode", () => {
  const messages = { RIDE_FULL: "מלאה", ALREADY_BOOKED: "רשומה" };

  it("finds the database's error code inside its message", () => {
    expect(messageForCode({ message: "P0001: RIDE_FULL" }, messages)).toBe("מלאה");
    expect(messageForCode({ message: "ALREADY_BOOKED" }, messages)).toBe("רשומה");
  });

  it("falls back to the general message for anything else", () => {
    expect(messageForCode({ message: "connection reset" }, messages)).toBe(GENERIC_ERROR);
    expect(messageForCode({ message: "" }, messages)).toBe(GENERIC_ERROR);
  });

  it("has a Hebrew general message", () => {
    expect(GENERIC_ERROR).toBe("משהו השתבש. נסי שוב בעוד רגע.");
  });
});

describe("firstIssue", () => {
  it("returns the first validation message", () => {
    const schema = z.object({ a: z.string().min(2, "ראשון"), b: z.string().min(2, "שני") });
    const result = schema.safeParse({ a: "", b: "" });
    expect(firstIssue(result.error!)).toBe("ראשון");
  });

  it("has a fallback when there are no issues", () => {
    expect(firstIssue(new z.ZodError([]))).toBe("חלק מהפרטים אינם תקינים.");
  });
});
