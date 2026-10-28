"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

// A dashboard ride card whose details fold away behind its header; the header's
// actions stay usable while it is closed.
export function CollapsibleRideCard({ summary, actions, children, cancelled, defaultOpen }: {
  summary: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  cancelled: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={`today-card ${cancelled ? "cancelled" : ""} ${open ? "open" : "collapsed"}`}>
      <div className="today-header">
        <button type="button" className="today-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={bodyId}>
          {summary}
          <ChevronDown {...iconProps} size={20} className="icon today-chevron" />
        </button>
        <div className="today-status-actions">{actions}</div>
      </div>
      <div id={bodyId} hidden={!open}>{children}</div>
    </section>
  );
}
