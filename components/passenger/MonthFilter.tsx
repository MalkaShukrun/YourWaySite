"use client";

import { useRouter } from "next/navigation";
import { formatMonth } from "@/lib/dates";
import { Select } from "@/components/ui/Select";

export function MonthFilter({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();
  return (
    <Select
      compact
      label="חודש"
      prefix="חודש"
      value={value}
      options={months.map((month) => ({ value: month, label: formatMonth(month) }))}
      onChange={(month) => router.push(`/payments?month=${month}`)}
    />
  );
}
