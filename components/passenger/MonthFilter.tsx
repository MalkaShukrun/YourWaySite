"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { formatMonth } from "@/lib/dates";

export function MonthFilter({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();
  return (
    <label className="month-filter">
      <span>חודש</span>
      <select value={value} onChange={(e) => router.push(`/payments?month=${e.target.value}`)}>
        {months.map((month) => (
          <option key={month} value={month}>{formatMonth(month)}</option>
        ))}
      </select>
      <ChevronDown className="icon" size={15} strokeWidth={1.8} />
    </label>
  );
}
