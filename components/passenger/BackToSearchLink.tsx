"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";

// The last ride search (its URL with filters), remembered for this tab so
// "back to all rides" on a ride page returns to the same results.
const STORAGE_KEY = "yourway-last-search";

export function rememberSearch(href: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    return;
  }
}

function readSearch() {
  try {
    const href = sessionStorage.getItem(STORAGE_KEY);
    // Only the search page itself, never "//other-site".
    return href?.startsWith("/?") ? href : "/";
  } catch {
    return "/";
  }
}

// Nothing to subscribe to: the ride page never changes the stored search.
const subscribe = () => () => {};

export function BackToSearchLink({ className, children }: { className?: string; children: ReactNode }) {
  const href = useSyncExternalStore(subscribe, readSearch, () => "/");
  return <Link className={className} href={href}>{children}</Link>;
}
