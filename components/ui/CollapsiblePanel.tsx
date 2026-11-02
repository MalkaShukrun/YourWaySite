"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

// A panel whose body folds away behind its title. The arrow is the button, and
// it stretches over the whole title row so the row is clickable too.
export function CollapsiblePanel({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section className={`panel ${open ? "open" : "collapsed"}`}>
      <div className="panel-title panel-title-toggle">
        <div><h2>{title}</h2><span>{subtitle}</span></div>
        <button type="button" className="panel-toggle" onClick={() => setOpen((v) => !v)} aria-label={title} aria-expanded={open} aria-controls={bodyId}>
          <ChevronDown {...iconProps} size={20} className="icon today-chevron" />
        </button>
      </div>
      <div id={bodyId} hidden={!open}>{children}</div>
    </section>
  );
}
