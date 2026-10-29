import { RedirectError } from "../setup";

// Runs a server action that may end in redirect(); returns { redirectedTo }
// instead of throwing, or the action's own result.
export async function runAction<T>(action: () => Promise<T>): Promise<T | { redirectedTo: string }> {
  try {
    return await action();
  } catch (e) {
    if (e instanceof RedirectError) return { redirectedTo: e.url };
    throw e;
  }
}
