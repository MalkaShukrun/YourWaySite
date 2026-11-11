import type { CSSProperties } from "react";
import { format, parseISO } from "date-fns";
import type { DailyStats } from "@/lib/admin/data";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { formatShortRideDate } from "@/lib/utils/dates";

// Each chart sums up its last day and its total or daily average. The
// passengers chart shows yesterday and an average: today and the total are
// already on the cards above ("טרמפיסטיות נוסעות היום", "טרמפיסטיות שנסעו עד היום").
type Metric = {
  key: Exclude<keyof DailyStats, "day">;
  title: string;
  subtitle: string;
  last: "today" | "yesterday";
  summary: "total" | "average";
};

const METRICS: Metric[] = [
  { key: "new_users", title: "משתמשות חדשות", subtitle: "הצטרפו למערכת באותו יום", last: "today", summary: "total" },
  { key: "non_driver_visitors", title: "נוסעות שהן לא נהגות", subtitle: "נכנסו למערכת ואין להן מסלול (לא נהגות)", last: "today", summary: "average" },
  { key: "visitors", title: "כל מי שנכנסה לאתר", subtitle: "כל המשתמשות שנכנסו למערכת באותו יום", last: "today", summary: "average" },
  { key: "passengers", title: "טרמפיסטיות שנסעו עם נהגת", subtitle: "נסעו עם נהגות באותו יום (הלוך וחזור נספרים פעמיים)", last: "yesterday", summary: "average" },
];

// Day by day since DAILY_STATS_FROM: a table, newest day first, and bar
// charts, oldest day on the left. Render only for admins (the caller checks
// with requireAdmin).
export function DailyChartsSection({ days }: { days: DailyStats[] }) {
  const from = days[0] ? format(parseISO(days[0].day), "d.M") : "";
  const summaries = METRICS.map((m) => ({ key: m.key, ...summarize(m, days) }));
  return (
    <CollapsiblePanel title="פעילות יומית" subtitle={`משתמשות שהצטרפו, נכנסו ונסעו בכל יום, מ־${from}`}>
      {/* The table first and open; the charts fold away under it. */}
      <details className="daily-toggle daily-table" open>
        <summary>הצגה כטבלה</summary>
        <table>
          <thead>
            <tr><th>יום</th>{METRICS.map((m) => <th key={m.key}>{m.title}</th>)}</tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}><td>{formatShortRideDate(d.day)}</td>{METRICS.map((m) => <td key={m.key}>{d[m.key]}</td>)}</tr>
            ))}
          </tbody>
          {/* The same totals and averages as the charts. */}
          <tfoot>
            <tr><th scope="row">סה״כ</th>{summaries.map((s) => <td key={s.key}>{s.total}</td>)}</tr>
            <tr><th scope="row">ממוצע יומי</th>{summaries.map((s) => <td key={s.key}>{s.average}</td>)}</tr>
          </tfoot>
        </table>
      </details>
      <details className="daily-toggle daily-charts-toggle">
        <summary>הצגה כגרפים</summary>
        <div className="daily-charts">
          {METRICS.map((metric) => <DailyChart key={metric.key} metric={metric} days={days} />)}
        </div>
      </details>
    </CollapsiblePanel>
  );
}

function summarize(metric: Metric, days: DailyStats[]) {
  const values = days.map((d) => d[metric.key]);
  const total = values.reduce((sum, v) => sum + v, 0);
  // A chart that ends its summary at yesterday averages whole days only.
  const counted = metric.last === "today" ? values : values.slice(0, -1);
  const average = counted.length ? (counted.reduce((sum, v) => sum + v, 0) / counted.length).toFixed(1) : 0;
  return { total, average };
}

function DailyChart({ metric, days }: { metric: Metric; days: DailyStats[] }) {
  const values = days.map((d) => d[metric.key]);
  const max = Math.max(1, ...values);
  const { total, average } = summarize(metric, days);
  const last = values.at(metric.last === "today" ? -1 : -2) ?? 0;
  // About eight date labels under the bars, counted back from today.
  const labelEvery = Math.ceil(days.length / 8);
  const labelled = (i: number) => (days.length - 1 - i) % labelEvery === 0;

  return (
    <figure className="daily-chart">
      <figcaption>
        <div>
          <h3>{metric.title}</h3>
          <span>{metric.subtitle}</span>
        </div>
        <div className="daily-summary">
          <span>{metric.last === "today" ? "היום" : "אתמול"} <strong>{last}</strong></span>
          <span>
            {metric.summary === "total"
              ? <>סה״כ <strong>{total}</strong></>
              : <>ממוצע יומי <strong>{average}</strong></>}
          </span>
        </div>
      </figcaption>
      <div className="daily-plot" dir="ltr">
        <span className="daily-max">{max}</span>
        <ol className="daily-bars">
          {days.map((d) => (
            <li key={d.day} tabIndex={0} aria-label={`${formatShortRideDate(d.day)}: ${d[metric.key]}`} style={{ "--h": `${(d[metric.key] / max) * 100}%` } as CSSProperties}>
              <span className="daily-bar" />
              <span className="daily-tip" dir="rtl">{formatShortRideDate(d.day)} · <strong>{d[metric.key]}</strong></span>
            </li>
          ))}
        </ol>
        <ol className="daily-axis" aria-hidden="true">
          {days.map((d, i) => (
            <li key={d.day}>{labelled(i) && format(parseISO(d.day), "d.M")}</li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
