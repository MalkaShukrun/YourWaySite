"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { RideGroup } from "@/lib/rides/types";
import { extractSearch, type ExtractedSearch, type PlaceChoice } from "@/lib/smart-search/extract";
import { iconProps } from "@/components/ui/icon";

type Ambiguity = ExtractedSearch["ambiguous"][number];

// Shows that times of day and the ride type work too, not only places and days.
const EXAMPLE = "לדוגמה: בית שמש לירושלים מחר בבוקר, קבועה";
const DEBOUNCE_MS = 400;
// "התכוונת ל…?" offers this many places; the filter below lists them all.
const MAX_CHOICES = 6;

// Smart search (spec C8), above the filters: she writes where from, where to
// and when in her own words. As she types, the filters fill in; Enter runs
// the search. Plain rules in the browser (lib/smart-search), no AI. Words it
// doesn't know are skipped quietly.
export function SmartSearch({
  groups,
  today,
  onFill,
  onSearch,
  onPick,
  onClear,
}: {
  groups: RideGroup[];
  today: string;
  onFill: (found: ExtractedSearch) => void;
  onSearch: (found: ExtractedSearch) => void;
  onPick: (role: Ambiguity["role"], choice: PlaceChoice) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");
  const [ambiguous, setAmbiguous] = useState<Ambiguity[]>([]);
  // What she picked in "התכוונת ל…?", for each end.
  const [picked, setPicked] = useState<Partial<Record<Ambiguity["role"], string>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The filters her sentence names. A place she picked stays picked, and
  // isn't asked about again, while the sentence still names its neighborhood.
  function read(value: string) {
    const found = extractSearch(value, groups, today);
    if (!found) {
      setAmbiguous([]);
      return null;
    }
    const open = found.ambiguous.filter(({ role, choices }) => {
      const pick = picked[role];
      if (!pick || !choices.some((c) => c.pick === pick)) return true;
      found[role === "origin" ? "origins" : "destinations"] = [pick];
      return false;
    });
    setAmbiguous(open);
    return { ...found, ambiguous: open };
  }

  function change(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const found = read(value);
      if (found) onFill(found);
    }, DEBOUNCE_MS);
  }

  function search() {
    clearTimeout(timer.current);
    const found = read(text);
    if (found) onSearch(found);
  }

  function clear() {
    clearTimeout(timer.current);
    setText("");
    setAmbiguous([]);
    setPicked({});
    onClear();
  }

  return (
    <div className="smart-search">
      <p className="smart-search-title" id="smart-search-title">
        <span className="smart-search-new">חדש!</span> חיפוש חכם ומהיר
      </p>
      {/* Not a form of its own: it sits inside the filters' form, so Enter
          is handled here and kept from sending that form. */}
      <div className="smart-search-box" role="search" aria-labelledby="smart-search-title">
        <Sparkles {...iconProps} size={21} className="icon smart-search-sparkle" aria-hidden="true" />
        <input
          type="text"
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            search();
          }}
          placeholder={EXAMPLE}
          aria-label="חיפוש חכם: מאיפה, לאן ומתי"
          maxLength={200}
          enterKeyHint="search"
        />
        {text && (
          <button type="button" className="smart-search-clear" onClick={clear} aria-label="ניקוי החיפוש" title="ניקוי">
            <X {...iconProps} size={18} />
          </button>
        )}
      </div>
      {ambiguous.map(({ role, choices }) => (
        <div key={role} className="smart-search-choices" aria-live="polite">
          <span>{role === "origin" ? "מאיפה" : "לאן"} — התכוונת ל…?</span>
          {choices.slice(0, MAX_CHOICES).map((choice) => (
            <button
              key={choice.pick}
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setAmbiguous((all) => all.filter((a) => a.role !== role));
                setPicked((all) => ({ ...all, [role]: choice.pick }));
                onPick(role, choice);
              }}
            >
              {choice.label}
            </button>
          ))}
          {choices.length > MAX_CHOICES && (
            <small>ועוד {choices.length - MAX_CHOICES} — אפשר לבחור בשדה &quot;{role === "origin" ? "מאיפה" : "לאן"}&quot;</small>
          )}
        </div>
      ))}
    </div>
  );
}
