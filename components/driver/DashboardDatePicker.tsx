"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { iconProps } from "@/components/ui/icon";

// Date selector for the daily dashboard (defaults to today).
export function DashboardDatePicker({ value, display, today }: { value: string; display: string; today: string }) {
  const router = useRouter();
  return (
    <DatePicker
      button
      label="בחירת תאריך"
      value={value}
      display={display}
      today={today}
      onChange={(date) => date && router.push(`/dashboard?date=${date}`)}
      icon={<CalendarDays {...iconProps} size={18} />}
    />
  );
}
