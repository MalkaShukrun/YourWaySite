import { CalendarDays, Car, History, Users } from "lucide-react";
import type { AdminStats } from "@/lib/admin/data";
import { StatCard } from "@/components/ui/StatCard";
import { carIconProps, iconProps } from "@/components/ui/icon";

// Site-wide ride totals: today's activity, then everything up to now.
export function AdminStatsSection({ stats }: { stats: AdminStats }) {
  return (
    <div className="admin-stats">
      <StatCard icon={<Users {...iconProps} size={20} />} value={stats.passengers_today} label="טרמפיסטיות נוסעות היום" tone="peach" />
      <StatCard icon={<Car {...carIconProps} size={20} />} value={stats.rides_today} label="נסיעות יוצאות היום" tone="green" />
      <StatCard icon={<History {...iconProps} size={20} />} value={stats.rides_departed} label="נסיעות שיצאו עם טרמפיסטיות" tone="blue" />
      <StatCard icon={<CalendarDays {...iconProps} size={20} />} value={stats.passengers_departed} label="טרמפיסטיות שנסעו עד היום" tone="peach" />
    </div>
  );
}
