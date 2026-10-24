"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";

// Date selector for the daily dashboard (defaults to today).
export function DashboardDatePicker({ value, label, today }: { value: string; label: string; today: string }) {
  const router = useRouter();
  return (
    <DatePicker
      button
      label="בחירת תאריך"
      value={value}
      display={label}
      today={today}
      onChange={(date) => date && router.push(`/dashboard?date=${date}`)}
      icon={<CalendarDays className="icon" size={18} strokeWidth={1.8} />}
    />
  );
}
