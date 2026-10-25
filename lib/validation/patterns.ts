// Value formats checked by both the forms and the server.

// "07:15"
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// "2025-06-22"
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

// For ids read from the URL, before they reach a query.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
