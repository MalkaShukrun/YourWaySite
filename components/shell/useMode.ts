"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { modeForPath, type Mode } from "./nav";

// Passenger / driver mode for the shell (SRS §7.1). Mode pages set it; shared
// pages (profile, admin) show the last mode used, remembered in this browser.
const STORAGE_KEY = "yourway-mode";
const listeners = new Set<() => void>();

function readStored(): Mode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "driver" ? "driver" : "passenger";
  } catch {
    return "passenger";
  }
}

function store(mode: Mode) {
  try {
    if (localStorage.getItem(STORAGE_KEY) === mode) return;
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    return;
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

export function useMode(): Mode {
  const fromRoute = modeForPath(usePathname());
  const stored = useSyncExternalStore(subscribe, readStored, () => "passenger" as Mode);

  useEffect(() => {
    if (fromRoute) store(fromRoute);
  }, [fromRoute]);

  return fromRoute ?? stored;
}
