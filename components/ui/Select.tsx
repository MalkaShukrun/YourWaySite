"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePopover } from "./usePopover";
import { pickSummary, toggleValue } from "./multiSelect";
import { iconProps } from "@/components/ui/icon";

type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string; // accessible name for the list
  icon?: ReactNode; // shown before the selected value
  prefix?: ReactNode; // inline caption inside the trigger (compact variant)
  compact?: boolean; // small pill, e.g. the payments month filter
  note?: ReactNode; // small print under the options
  searchable?: boolean; // the field is a text box that filters the options as you type
};

// The design's dropdown: a field-style trigger and a floating list with the
// selected option highlighted in lime. Used instead of the native <select>.
export function Select(props: Props) {
  return props.searchable ? <Combobox {...props} /> : <ListSelect {...props} />;
}

function ListSelect({ value, options, onChange, label, icon, prefix, compact = false, note }: Props) {
  const { open, setOpen, ref } = usePopover();
  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={`dropdown ${compact ? "compact" : ""} ${open ? "open" : ""}`} ref={ref}>
      <button
        className={`dropdown-trigger ${compact ? "" : "input-shell"}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {prefix && <small>{prefix}</small>}
        <span>{selected?.label}</span>
        <ChevronDown className="icon dropdown-chevron" size={16} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="dropdown-options" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === selected?.value;
            return (
              <button
                key={option.value || "all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={isSelected ? "selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check {...iconProps} size={16} />}
              </button>
            );
          })}
          {note && <p className="dropdown-note">{note}</p>}
        </div>
      )}
    </div>
  );
}

// Autocomplete variant: type into the field to filter the list, then pick with
// a click or the arrow keys + Enter. Opening clears the text; leaving the field
// without picking puts the last pick back.
function Combobox({ value, options, onChange, label, icon, note }: Props) {
  const { open, setOpen, ref } = usePopover();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];
  const [query, setQuery] = useState<string | null>(null); // null: not typing
  const [active, setActive] = useState(0);

  const typing = open ? query : null;
  const term = typing?.trim().toLowerCase() ?? "";
  const matches = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;

  function show() {
    if (open) return;
    setQuery(""); // start from an empty field; the current pick stays as the placeholder
    setActive(Math.max(0, options.indexOf(selected)));
    setOpen(true);
  }

  function pick(option: SelectOption) {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return show();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (event.key === "Enter" && open) {
      // Don't submit the form while choosing.
      event.preventDefault();
      if (matches[active]) pick(matches[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`dropdown combobox ${open ? "open" : ""}`} ref={ref}>
      <div
        className="dropdown-trigger input-shell"
        onClick={() => {
          inputRef.current?.focus();
          show();
        }}
      >
        {icon}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={typing ?? selected?.label ?? ""}
          placeholder={selected?.label}
          onFocus={show}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          className="icon dropdown-chevron"
          size={16}
          strokeWidth={1.8}
          onClick={(event) => {
            event.stopPropagation();
            if (open) setOpen(false);
            else {
              inputRef.current?.focus();
              show();
            }
          }}
        />
      </div>
      {open && (
        <div className="dropdown-options" role="listbox" id={listId} aria-label={label}>
          {matches.map((option, index) => {
            const isSelected = option.value === selected?.value;
            return (
              <button
                key={option.value || "all"}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={`${isSelected ? "selected" : ""} ${index === active ? "active" : ""}`}
                onMouseDown={(event) => event.preventDefault()} // keep focus in the field
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check {...iconProps} size={16} />}
              </button>
            );
          })}
          {matches.length === 0 && <p className="dropdown-empty">לא נמצאו תוצאות</p>}
          {note && <p className="dropdown-note">{note}</p>}
        </div>
      )}
    </div>
  );
}

type MultiProps = {
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  label: string; // accessible name for the list
  allLabel: string; // the first option, picked when nothing else is — it clears the rest
  icon?: ReactNode;
};

// Searchable select that picks several options: clicking an option toggles it
// and the list stays open. The field shows the first pick and how many more.
export function MultiSelect({ values, options, onChange, label, allLabel, icon }: MultiProps) {
  const { open, setOpen, ref } = usePopover();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null); // null: not typing
  const [active, setActive] = useState(0);

  const all = { value: "", label: allLabel };
  const summary = pickSummary(options, values, allLabel);
  const typing = open ? query : null;
  const term = typing?.trim().toLowerCase() ?? "";
  const matches = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : [all, ...options];

  function show() {
    if (open) return;
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function toggle(option: SelectOption) {
    onChange(toggleValue(values, option.value));
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return show();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (event.key === "Enter" && open) {
      // Don't submit the form while choosing.
      event.preventDefault();
      if (matches[active]) toggle(matches[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`dropdown combobox ${open ? "open" : ""}`} ref={ref}>
      <div
        className="dropdown-trigger input-shell"
        onClick={() => {
          inputRef.current?.focus();
          show();
        }}
      >
        {icon}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={typing ?? summary}
          placeholder={summary}
          onFocus={show}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          className="icon dropdown-chevron"
          size={16}
          strokeWidth={1.8}
          onClick={(event) => {
            event.stopPropagation();
            if (open) setOpen(false);
            else {
              inputRef.current?.focus();
              show();
            }
          }}
        />
      </div>
      {open && (
        <div className="dropdown-options" role="listbox" aria-multiselectable="true" id={listId} aria-label={label}>
          {matches.map((option, index) => {
            const isSelected = option.value ? values.includes(option.value) : values.length === 0;
            return (
              <button
                key={option.value || "all"}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={`${isSelected ? "selected" : ""} ${index === active ? "active" : ""}`}
                onMouseDown={(event) => event.preventDefault()} // keep focus in the field
                onMouseEnter={() => setActive(index)}
                onClick={() => toggle(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check {...iconProps} size={16} />}
              </button>
            );
          })}
          {matches.length === 0 && <p className="dropdown-empty">לא נמצאו תוצאות</p>}
        </div>
      )}
    </div>
  );
}
