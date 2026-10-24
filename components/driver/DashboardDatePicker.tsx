"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

// Date selector for the daily dashboard (defaults to today).
export function DashboardDatePicker({ value, label }: { value: string; label: string }) {
  const router = useRouter();
  return (
    <label className="btn btn-secondary date-picker-btn">
      <CalendarDays className="icon" size={18} strokeWidth={1.8} />
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => e.target.value && router.push(`/dashboard?date=${e.target.value}`)}
        aria-label="בחירת תאריך"
      />
    </label>
  );
}
