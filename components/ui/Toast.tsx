"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

// Small confirmation message from the design (bottom corner, auto-hides).
// Pass a new `id` to show the same text again.
export function Toast({ message, id }: { message: string; id?: number }) {
  const [hidden, setHidden] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setHidden(id ?? 0), 3400);
    return () => window.clearTimeout(timer);
  }, [message, id]);

  if (!message || hidden === (id ?? 0)) return null;
  return (
    <div className="toast" role="status">
      <span><Check {...iconProps} size={18} /></span>
      {message}
    </div>
  );
}
