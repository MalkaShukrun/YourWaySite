import type { z } from "zod";

// Error messages shared by the Server Actions.

export const GENERIC_ERROR = "משהו השתבש. נסי שוב בעוד רגע.";

// The Postgres functions raise error codes such as RIDE_FULL; this maps the
// code in `error.message` to its Hebrew message, or the generic one.
export function messageForCode(error: { message: string }, messages: Record<string, string>) {
  const code = Object.keys(messages).find((key) => error.message.includes(key));
  return code ? messages[code] : GENERIC_ERROR;
}

// The first validation message, for forms that show one error at a time.
export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "חלק מהפרטים אינם תקינים.";
}
