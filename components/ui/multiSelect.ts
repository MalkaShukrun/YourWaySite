// Selection rules of <MultiSelect> (components/ui/Select.tsx), kept apart so
// they can be tested without a browser.

type Option = { value: string; label: string };

// Clicking an option: the "all" option ("") clears the picks, any other one
// is added or removed.
export function toggleValue(values: string[], value: string) {
  if (!value) return [];
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

// What the closed field shows: the "all" label, the one pick, or the first
// pick and how many more ("בית שמש ← ירושלים +2"). Picks follow the options' order.
export function pickSummary(options: Option[], values: string[], allLabel: string) {
  const picked = options.filter((o) => values.includes(o.value));
  if (picked.length === 0) return allLabel;
  return picked.length === 1 ? picked[0].label : `${picked[0].label} +${picked.length - 1}`;
}
