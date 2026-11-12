"use client";

import { usePathname } from "next/navigation";
import { useHydrated } from "@/components/ui/useHydrated";

// The pathname for the menus. Parts of the shell stream in after the page,
// so a navigation can start before they hydrate; hydrating them with the new
// path leaves the server's active tab in the DOM (React doesn't patch
// attributes). They hydrate with the address the page was loaded at — what
// the server rendered — and switch to the current one right after.
export function useShellPathname() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  if (hydrated || typeof window === "undefined") return pathname;
  return loadedPathname() ?? pathname;
}

function loadedPathname() {
  const [entry] = performance.getEntriesByType("navigation");
  return entry ? new URL(entry.name).pathname : null;
}
