"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// False in the server render and until React has taken over the page, then
// true. Forms keep their submit button disabled until then: a click before
// that would submit the form natively, putting its fields in the URL.
export function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}
