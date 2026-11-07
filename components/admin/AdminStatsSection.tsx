import { BellRing, CalendarDays, Car, History, Mail, MailPlus, Users } from "lucide-react";
import type { AdminStats, EmailStats } from "@/lib/admin/data";
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

// How many members have each of the profile's email switches on.
export function EmailStatsSection({ stats }: { stats: EmailStats }) {
  return (
    <div className="admin-stats">
      <StatCard icon={<BellRing {...iconProps} size={20} />} value={stats.ride_emails} label="טרמפיסטיות שמקבלות מייל על הצטרפות וביטול נסיעה" tone="peach" />
      <StatCard icon={<Mail {...iconProps} size={20} />} value={stats.daily_email} label="נהגות שמקבלות מייל יומי על הטרמפיסטיות שמצטרפות" tone="blue" />
      <StatCard icon={<MailPlus {...iconProps} size={20} />} value={stats.daily_email_updates} label="נהגות שמקבלות מייל עדכון על נוסעת חדשה" tone="purple" />
    </div>
  );
}
