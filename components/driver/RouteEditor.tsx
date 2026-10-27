"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, MapPin, Plus, Repeat, Route, Users } from "lucide-react";
import { saveRoute } from "@/app/(app)/(driver)/actions";
import { LazyRouteEditorMap } from "@/components/map/LazyMaps";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import { iconProps } from "@/components/ui/icon";
import type { RideGroup } from "@/lib/ride-types";
import type { EditableRoute } from "@/lib/driver-types";
import { groupLabel, RIDE_WEEKDAYS } from "@/lib/format";
import { groupArea } from "@/lib/places";
import { routeSchema, type RouteValues } from "@/lib/validation/route";
import { useHydrated } from "@/components/ui/useHydrated";

type Props = { groups: RideGroup[]; route: EditableRoute | null; today: string };

// Add / edit a route: details, days & times, and stops — marking them on the
// map is optional (SRS §5.1).
export function RouteEditor({ groups, route, today }: Props) {
  // The stop (by index) waiting for a click on the map.
  const [placing, setPlacing] = useState<number | null>(null);
  const [serverError, setServerError] = useState("");
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

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
      rideDate: route?.ride_date ?? today,
      outTime: route ? route.out_time.slice(0, 5) : "07:15",
      seats: String(route?.seats ?? 4),
      price: String(route?.price ?? ""),
      stops: route?.stops.map((s) => ({ id: s.id, kind: s.kind, label: s.label, lat: s.lat, lng: s.lng })) ?? [],
    },
  });
  const { fields, append, remove, update } = useFieldArray({ control, name: "stops", keyName: "key" });
  const kind = useWatch({ control, name: "kind" });
  const groupId = useWatch({ control, name: "groupId" });
  const group = groups.find((g) => g.id === groupId);
  const area = group ? groupArea(group.origin, group.destination) : null;
  const weekdays = useWatch({ control, name: "weekdays" });
  const dateLabel = kind === "recurring" ? "תאריך התחלה" : "תאריך הנסיעה";
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

  const renderStopList = (stopKind: "pickup" | "dropoff") => (
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
              <button
                type="button"
                className={`stop-place ${stops[index]?.lat != null ? "is-placed" : ""} ${placing === index ? "is-armed" : ""}`}
                onClick={() => setPlacing(placing === index ? null : index)}
                aria-pressed={placing === index}
                aria-label={stops[index]?.lat != null ? "שינוי המיקום על המפה" : "סימון על המפה"}
                title={stops[index]?.lat != null ? "מסומנת על המפה — לחצי לשינוי" : "סימון על המפה (לא חובה)"}
              >
                <MapPin {...iconProps} size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlacing(null);
                  remove(index);
                }}
                aria-label="מחיקת התחנה"
              >
                ×
              </button>
            </div>
          ),
        )}
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          setPlacing(null);
          append({ id: "", kind: stopKind, label: "", lat: null, lng: null });
        }}
      >
        <Plus {...iconProps} size={18} />
        {stopKind === "pickup" ? "הוספת תחנת איסוף" : "הוספת תחנת הורדה"}
      </button>
    </div>
  );

  const firstError =
    errors.groupId?.message ??
    errors.weekdays?.message ??
    errors.rideDate?.message ??
    errors.outTime?.message ??
    errors.seats?.message ??
    errors.price?.message ??
    errors.stops?.message ??
    errors.stops?.root?.message ??
    (Array.isArray(errors.stops) && errors.stops.some((s) => s?.label) ? "יש לתת שם לכל תחנה" : undefined);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="welcome">
        <div><p>הגדרת נסיעה</p><h1>{route ? "עריכת מסלול" : "מסלול חדש"}</h1></div>
      </div>

      <div className="editor-layout">
        <section className="panel editor-form">
          <div className="editor-section">
            <div className="section-heading"><span>1</span><div><h2>פרטי הנסיעה</h2><p>בחרי מסלול וסוג נסיעה</p></div></div>
            <div className="field">
              <span>מסלול נסיעה</span>
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
            {kind === "recurring" && (
              <div className="day-picker" role="group" aria-label="ימים בשבוע">
                {RIDE_WEEKDAYS.map((day, index) => (
                  <button type="button" key={day} className={weekdays.includes(index) ? "active" : ""} aria-pressed={weekdays.includes(index)} onClick={() => toggleDay(index)}>
                    {day}
                  </button>
                ))}
              </div>
            )}
            {/* One-time: the ride's date. Recurring: the first date it runs. */}
            <div className="field one-time-date">
              <span>{dateLabel}</span>
              <Controller
                control={control}
                name="rideDate"
                render={({ field }) => (
                  <DatePicker label={dateLabel} value={field.value} onChange={field.onChange} today={today} min={today} />
                )}
              />
            </div>
            <div className="form-grid compact">
              <div className="field">
                <span>שעת יציאה</span>
                <Controller
                  control={control}
                  name="outTime"
                  render={({ field }) => <TimePicker label="שעת יציאה" value={field.value} onChange={field.onChange} />}
                />
              </div>
              <label className="field">
                <span>מקומות פנויים</span>
                <div className="input-shell"><Users {...iconProps} size={20} /><input inputMode="numeric" {...register("seats")} /></div>
              </label>
              <label className="field">
                <span>מחיר לכל טרמפיסטית</span>
                <div className="input-shell price-input"><span>₪</span><input inputMode="decimal" {...register("price")} placeholder="0" /></div>
              </label>
            </div>
          </div>

          <div className="editor-section">
            <div className="section-heading"><span>3</span><div><h2>תחנות איסוף והורדה</h2><p>הגדירי בנפרד היכן ניתן לעלות והיכן ניתן לרדת</p></div></div>
            {renderStopList("pickup")}
            {renderStopList("dropoff")}
          </div>

          <div className="editor-footer">
            {(firstError || serverError) && <p className="form-alert" role="alert">{serverError || firstError}</p>}
            <div className="editor-actions">
              <Link className="btn btn-secondary" href="/routes">ביטול</Link>
              <button type="submit" className="btn btn-primary" disabled={!hydrated || pending}>
                {pending ? "שומר..." : "שמירת המסלול"}
              </button>
            </div>
          </div>
        </section>

        <section className="panel editor-map">
          <div className="panel-title">
            <div>
              <h2>סימון המסלול על המפה <small className="optional-tag">לא חובה</small></h2>
              <ol className="map-steps">
                <li><span>1</span>הוסיפי תחנות ברשימה</li>
                <li><span>2</span>לחצי על <MapPin {...iconProps} size={14} /> ליד תחנה ואז על המפה</li>
                <li><span>3</span>גררי תחנה לשינוי המיקום</li>
              </ol>
            </div>
          </div>
          <LazyRouteEditorMap
            stops={stops}
            area={area}
            placing={placing === null ? null : stops[placing]?.kind ?? null}
            onPlace={(lat, lng) => {
              if (placing === null) return;
              update(placing, { ...stops[placing], lat, lng });
              setPlacing(null);
            }}
            onMove={(index, lat, lng) => update(index, { ...stops[index], lat, lng })}
          />
        </section>
      </div>
    </form>
  );
}
