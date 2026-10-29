"use client";

import { useRef, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

// Wraps the dashboard's collapsible day sections with "open all" / "collapse all" controls.
// `actions` go at the end of the same row.
export function WeekDays({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const setAll = (open: boolean) => list.current?.querySelectorAll<HTMLDetailsElement>(".week-day").forEach((d) => { d.open = open; });

  return (
    <>
      <div className="week-days-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setAll(true)}><ChevronsUpDown {...iconProps} size={18} /> פתיחת הכל</button>
        <button type="button" className="btn btn-secondary" onClick={() => setAll(false)}><ChevronsDownUp {...iconProps} size={18} /> סגירת הכל</button>
        {actions}
      </div>
      <div ref={list}>{children}</div>
    </>
  );
}
