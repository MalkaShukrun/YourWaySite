"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 1600; // ms
const format = new Intl.NumberFormat("he-IL");

// A number that counts up from 0 the first time it scrolls into view. Screen
// readers get the final value straight away; reduced motion skips the count.
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function run() {
      const start = performance.now();
      const tick = (now: number) => {
        const t = reduced ? 1 : Math.min(1, (now - start) / DURATION);
        setShown(Math.round(value * (1 - (1 - t) ** 3))); // ease-out cubic
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      run();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} aria-label={format.format(value)}>
      <span aria-hidden="true">{format.format(shown)}</span>
    </span>
  );
}
