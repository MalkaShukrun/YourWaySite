"use client";

import { createContext, use, useTransition, type ReactNode, type TransitionStartFunction } from "react";

// A search she runs loads its results as a transition, so the current results
// stay on screen — dimmed — until the new ones arrive, instead of blinking to
// a loading state.
type SearchTransition = { updating: boolean; startUpdate: TransitionStartFunction };
const Context = createContext<SearchTransition | null>(null);

export function SearchTransitionProvider({ children }: { children: ReactNode }) {
  const [updating, startUpdate] = useTransition();
  return <Context value={{ updating, startUpdate }}>{children}</Context>;
}

export function useSearchTransition(): SearchTransition {
  const value = use(Context);
  if (!value) throw new Error("useSearchTransition needs <SearchTransitionProvider>");
  return value;
}

// The results, dimmed and marked busy while new ones load.
export function SearchResultsFrame({ children }: { children: ReactNode }) {
  const { updating } = useSearchTransition();
  return (
    <div id="search-results" className={`search-results${updating ? " updating" : ""}`} aria-busy={updating}>
      {children}
    </div>
  );
}
