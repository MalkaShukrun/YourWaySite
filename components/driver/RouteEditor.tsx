"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, Plus, Repeat, Route, Users } from "lucide-react";
import { saveRoute } from "@/app/(driver)/actions";
import { Select } from "@/components/ui/Select";
import { groupLabel, type RideGroup } from "@/lib/ride-types";
import { WEEKDAYS, type EditableRoute } from "@/lib/driver-types";
import { routeSchema, type RouteValues } from "@/lib/validation/route";

const RouteEditorMap = dynamic(() => import("@/components/map/RouteEditorMap"), {
  ssr: false,
  loading: () => <div className="large-map" aria-busy="true" />,
});

const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

type Props = { groups: RideGroup[]; route: EditableRoute | null; today: string };

// Add / edit a route: details, days & times, and stops on the map (SRS §5.1).
export function RouteEditor({ groups, route, today }: Props) {
  const [adding, setAdding] = useState<"pickup" | "dropoff" | null>(null);
  const [serverError, setServerError] = useState("");
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RouteValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      groupId: route?.group_id ?? groups[0]?.id ?? "",
      kind: route?.kind ?? "recurring",
      weekdays: route?.weekdays ?? [0, 2, 4],
      rideDate: route?.ride_date ?? "",
      outTime: route ? route.out_time.slice(0, 5) : "07:15",
      returnTime: route?.return_time ? route.return_time.slice(0, 5) : "",
      seats: String(route?.seats ?? 4),
      price: String(route?.price ?? ""),
      stops: route?.stops.map((s) => ({ id: s.id, kind: s.kind, label: s.label, lat: s.lat, lng: s.lng })) ?? [],
    },
  });
  const { fields, append, remove, update } = useFieldArray({ control, name: "stops", keyName: "key" });
  const kind = useWatch({ control, name: "kind" });
  const weekdays = useWatch({ control, name: "weekdays" });
  const stops = useWatch({ control, name: "stops" });

  const toggleDay = (day: number) =>
    setValue(
      "weekdays",
      weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort(),
      { shouldValidate: true },
    );

  const onSubmit = (values: RouteValues) =>
    startTransition(async () => {
      setServerError("");
      const result = await saveRoute(values, route?.id ?? null);
      if (result?.error) setServerError(result.error);
    });

  const stopGroup = (stopKind: "pickup" | "dropoff") => (
    <div className={`editor-stop-group ${stopKind === "dropoff" ? "dropoff-editor-group" : ""}`}>
      <div className={`stop-group-label ${stopKind}-label`}><i></i>{stopKind === "pickup" ? "תחנות איסוף" : "תחנות הורדה"}</div>
      <div className={`editor-stops ${stopKind === "dropoff" ? "dropoff-editor-stops" : ""}`}>
        {fields.map((field, index) =>
          field.kind !== stopKind ? null : (
            <div key={field.key}>
              <span>{fields.slice(0, index + 1).filter((f) => f.kind === stopKind).length}</span>
              <input
                {...register(`stops.${index}.label`)}
                placeholder="שם התחנה (לדוגמה: צומת ביג)"
                autoFocus={!field.label}
                aria-invalid={Boolean(errors.stops?.[index]?.label)}
              />
              <button type="button" onClick={() => remove(index)} aria-label="מחיקת התחנה">×</button>
            </div>
          ),
        )}
      </div>
      <button
        type="button"
        className={`btn btn-secondary ${adding === stopKind ? "is-armed" : ""}`}
        onClick={() => setAdding(adding === stopKind ? null : stopKind)}
      >
        <Plus {...iconProps} size={18} />
        {adding === stopKind ? "לחצי על המפה…" : stopKind === "pickup" ? "הוספת תחנת איסוף" : "הוספת תחנת הורדה"}
      </button>
    </div>
  );

  const firstError =
    errors.groupId?.message ??
    errors.weekdays?.message ??
    errors.rideDate?.message ??
    errors.outTime?.message ??
    errors.returnTime?.message ??
    errors.seats?.message ??
    errors.price?.message ??
    errors.stops?.message ??
    errors.stops?.root?.message ??
    (Array.isArray(errors.stops) && errors.stops.some((s) => s?.label) ? "יש לתת שם לכל תחנה" : undefined);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="welcome">
        <div><p>הגדרת נסיעה</p><h1>{route ? "עריכת מסלול" : "מסלול חדש"}</h1></div>
        <div className="dashboard-actions">
          <Link className="btn btn-secondary" href="/routes">ביטול</Link>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "שומרת…" : "שמירת המסלול"}
          </button>
        </div>
      </div>
      {(firstError || serverError) && <p className="form-alert" role="alert">{serverError || firstError}</p>}

      <div className="editor-layout">
        <section className="panel editor-form">
          <div className="editor-section">
            <div className="section-heading"><span>1</span><div><h2>פרטי הנסיעה</h2><p>בחרי קבוצה וסוג נסיעה</p></div></div>
            <div className="field">
              <span>קבוצת נסיעה</span>
              <Controller
                control={control}
                name="groupId"
                render={({ field }) => (
                  <Select
                    label="קבוצת נסיעה"
                    value={field.value}
                    onChange={field.onChange}
                    options={groups.map((g) => ({ value: g.id, label: groupLabel(g.origin, g.destination) }))}
                    icon={<Route {...iconProps} size={20} />}
                  />
                )}
              />
            </div>
            <div className="kind-switch">
              <button type="button" className={kind === "recurring" ? "active" : ""} onClick={() => setValue("kind", "recurring", { shouldValidate: true })}>
                <Repeat {...iconProps} size={20} /> נסיעה קבועה
              </button>
              <button type="button" className={kind === "one_time" ? "active" : ""} onClick={() => setValue("kind", "one_time", { shouldValidate: true })}>
                <CalendarDays {...iconProps} size={20} /> נסיעה חד־פעמית
              </button>
            </div>
          </div>

          <div className="editor-section">
            <div className="section-heading"><span>2</span><div><h2>ימים ושעות</h2><p>מתי את יוצאת וחוזרת?</p></div></div>
            {kind === "recurring" ? (
              <div className="day-picker" role="group" aria-label="ימים בשבוע">
                {WEEKDAYS.map((day, index) => (
                  <button type="button" key={day} className={weekdays.includes(index) ? "active" : ""} aria-pressed={weekdays.includes(index)} onClick={() => toggleDay(index)}>
                    {day}
                  </button>
                ))}
              </div>
            ) : (
              <label className="field one-time-date">
                <span>תאריך הנסיעה</span>
                <div className="input-shell">
                  <CalendarDays {...iconProps} size={20} />
                  <input type="date" min={today} {...register("rideDate")} />
                </div>
              </label>
            )}
            <div className="form-grid compact">
              <label className="field">
                <span>שעת יציאה</span>
                <div className="input-shell"><Clock {...iconProps} size={20} /><input type="time" {...register("outTime")} /></div>
              </label>
              <label className="field">
                <span>שעת חזרה משוערת</span>
                <div className="input-shell"><Clock {...iconProps} size={20} /><input type="time" {...register("returnTime")} /></div>
              </label>
              <label className="field">
                <span>מקומות פנויים</span>
                <div className="input-shell"><Users {...iconProps} size={20} /><input inputMode="numeric" {...register("seats")} /></div>
              </label>
              <label className="field">
                <span>מחיר לכל טרמפיסטית</span>
                <div className="input-shell price-input"><span>₪</span><input inputMode="decimal" {...register("price")} placeholder="0" /></div>
              </label>
            </div>
            <small className="field-hint">שעת חזרה ריקה = חזרה גמישה</small>
          </div>

          <div className="editor-section">
            <div className="section-heading"><span>3</span><div><h2>תחנות איסוף והורדה</h2><p>הגדירי בנפרד היכן ניתן לעלות והיכן ניתן לרדת</p></div></div>
            {stopGroup("pickup")}
            {stopGroup("dropoff")}
          </div>
        </section>

        <section className="panel editor-map">
          <div className="panel-title">
            <div><h2>סימון המסלול על המפה</h2><span>לחצי על “הוספת תחנה” ואז על המפה · גררי תחנה לשינוי המיקום</span></div>
          </div>
          <RouteEditorMap
            stops={stops}
            adding={adding}
            onAdd={(lat, lng) => {
              if (!adding) return;
              append({ id: "", kind: adding, label: "", lat, lng });
              setAdding(null);
            }}
            onMove={(index, lat, lng) => update(index, { ...stops[index], lat, lng })}
          />
        </section>
      </div>
    </form>
  );
}
