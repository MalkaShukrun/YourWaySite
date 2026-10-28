"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { iconProps } from "@/components/ui/icon";

// Week selector for the weekly dashboard: any date picks the week that holds it (defaults to this week).
export function DashboardDatePicker({ value, display, today, week }: { value: string; display: string; today: string; week: string[] }) {
  const router = useRouter();
  return (
    <DatePicker
      button
      label="בחירת תאריך"
      value={value}
      display={display}
      selectedDays={week}
      today={today}
      onChange={(date) => date && router.push(`/dashboard?date=${date}`)}
      icon={<CalendarDays {...iconProps} size={18} />}
    />
  );
}
