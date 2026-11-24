"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import type { RideGroup } from "@/lib/rides/types";
import { extractSearch, type ExtractedSearch, type PlaceChoice } from "@/lib/smart-search/extract";
import type { RecentSearch } from "@/lib/rides/recentSearches";
import { iconProps } from "@/components/ui/icon";
import { RecentSearchesMenu, recentOptionId, type RecentSearchView } from "@/components/passenger/RecentSearchesMenu";

type Ambiguity = ExtractedSearch["ambiguous"][number];

// Shows that times of day and the ride type work too, not only places and days.
const EXAMPLE = "לדוגמה: בית שמש לירושלים מחר בבוקר, קבועה";
const DEBOUNCE_MS = 400;
// "התכוונת ל…?" offers this many places; the filter below lists them all.
const MAX_CHOICES = 6;

// Smart search (spec C8), above the filters: she writes where from, where to
// and when in her own words. As she types, the filters fill in; the arrow
// (or Enter) runs the search. Plain rules in the browser (lib/smart-search), no AI. Words it
// doesn't know are skipped quietly.
export function SmartSearch({
  groups,
  today,
  onFill,
  onSearch,
  onPick,
  onClear,
  recent,
}: {
  groups: RideGroup[];
  today: string;
  onFill: (found: ExtractedSearch) => void;
  onSearch: (found: ExtractedSearch) => void;
  onPick: (role: Ambiguity["role"], choice: PlaceChoice) => void;
  onClear: () => void;
  // Her recent searches, offered under the box whenever it's focused; a
  // pick fills the filters with it.
  recent?: { searches: RecentSearchView[]; onPick: (search: RecentSearch) => void; onClear: () => void };
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
    // Typing puts her recent searches away; they're back on the next focus or click.
    setMenuOpen(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const found = read(value);
      if (found) onFill(found);
    }, DEBOUNCE_MS);
  }

  function search() {
    clearTimeout(timer.current);
    // Running it puts her recent searches away.
    setMenuOpen(false);
    const found = read(text);
    if (found) onSearch(found);
  }

  function clear() {
    clearTimeout(timer.current);
    setText("");
    setAmbiguous([]);
    setPicked({});
    onClear();
    // Back to the box: her recent searches open under it.
    inputRef.current?.focus();
  }

  // ─── Recent searches: a dropdown on every focus of the box ────────────────
  // Empty or with a sentence in it. Opens on focus (or a click, or ↓, after
  // typing, a pick or Esc closed it); ↑ ↓ move, Enter picks, Esc closes;
  // typing or focus leaving closes it. Hidden otherwise.
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const searches = recent?.searches ?? [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const menuShown = menuOpen && searches.length > 0;
  const menuId = useId();

  function openMenu() {
    if (menuOpen) return;
    setMenuOpen(true);
    setActive(-1);
  }

  function pickRecent(view: RecentSearchView) {
    setMenuOpen(false);
    recent?.onPick(view.search);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    const count = searches.length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && count) {
      e.preventDefault();
      const down = e.key === "ArrowDown";
      // Closed: opens on the first (↓) or the last (↑), whatever was marked before.
      if (!menuShown) {
        setMenuOpen(true);
        setActive(down ? 0 : count - 1);
      } else setActive((i) => (down ? (i + 1) % count : i <= 0 ? count - 1 : i - 1));
      return;
    }
    if (e.key === "Escape" && menuShown) {
      e.preventDefault();
      setMenuOpen(false);
      return;
    }
    // Not a form of its own: it sits inside the filters' form, so Enter is
    // handled here and kept from sending that form.
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (menuShown && searches[active]) pickRecent(searches[active]);
    else search();
  }

  return (
    <div className="smart-search">
      <p className="smart-search-title" id="smart-search-title">
        <span className="smart-search-new">חדש!</span> חיפוש חכם ומהיר
      </p>
      <div
        className="smart-search-field"
        ref={fieldRef}
        onBlur={(e) => {
          if (!fieldRef.current?.contains(e.relatedTarget)) setMenuOpen(false);
        }}
      >
        <div className="smart-search-box" role="search" aria-labelledby="smart-search-title">
          <Sparkles {...iconProps} size={21} className="icon smart-search-sparkle" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={menuShown}
            aria-controls={menuShown ? menuId : undefined}
            aria-activedescendant={menuShown && active >= 0 ? recentOptionId(menuId, active) : undefined}
            value={text}
            onChange={(e) => change(e.target.value)}
            onFocus={openMenu}
            onClick={openMenu}
            onKeyDown={keyDown}
            placeholder={EXAMPLE}
            aria-label="חיפוש חכם: מאיפה, לאן ומתי"
            maxLength={200}
            enterKeyHint="search"
            autoComplete="off"
          />
          {text && (
            <button type="button" className="smart-search-clear" onClick={clear} aria-label="ניקוי החיפוש" title="ניקוי">
              <X {...iconProps} size={18} />
            </button>
          )}
          {/* Runs the search her sentence describes, as Enter does. */}
          <button
            type="button"
            className="smart-search-go"
            onClick={search}
            disabled={!text.trim()}
            aria-label="חיפוש לפי מה שכתבת"
            title="חיפוש"
          >
            <ArrowLeft {...iconProps} size={20} />
          </button>
        </div>
        {menuShown && (
          <RecentSearchesMenu
            id={menuId}
            searches={searches}
            active={active}
            onPick={pickRecent}
            onActive={setActive}
            onClear={() => {
              recent?.onClear();
              // The list (and its button) is gone: back to the box.
              inputRef.current?.focus();
            }}
          />
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
