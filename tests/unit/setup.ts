import { vi } from "vitest";

// Next's request-time APIs, replaced for every unit test file. redirect() and
// notFound() throw like the real ones, so code after them doesn't run.
export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), io: vi.fn(async () => {}), cacheLife: vi.fn() }));
// Throws outside Next's server bundle; the tests import the server modules directly.
vi.mock("server-only", () => ({}));
