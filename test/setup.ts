import { vi } from "vitest";

// Next's request-time APIs, replaced for every test file. redirect() throws
// like the real one, so code after it doesn't run.
export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), io: vi.fn(async () => {}) }));
