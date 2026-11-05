"use client";

import { useRef, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

// Wraps a list of collapsible <details> sections with "open all" / "collapse all"
// controls, in a row styled by `className`. `actions` go at the end of the row.
export function FoldAll({ children, className, actions }: { children: ReactNode; className: string; actions?: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const setAll = (open: boolean) => list.current?.querySelectorAll<HTMLDetailsElement>(":scope > details").forEach((d) => { d.open = open; });

  return (
    <>
      <div className={`fold-all ${className}`}>
        <button type="button" className="btn btn-secondary" onClick={() => setAll(true)}><ChevronsUpDown {...iconProps} size={18} /> פתיחת הכל</button>
        <button type="button" className="btn btn-secondary" onClick={() => setAll(false)}><ChevronsDownUp {...iconProps} size={18} /> סגירת הכל</button>
        {actions}
      </div>
      <div ref={list}>{children}</div>
    </>
  );
}
