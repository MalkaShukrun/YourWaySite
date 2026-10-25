"use client";

type Props = {
  question: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// "Are you sure?" in place of the button that asked, for removals.
export function ConfirmInline({ question, confirmLabel, pendingLabel, pending, onConfirm, onCancel }: Props) {
  return (
    <span className="confirm-inline">
      <span>{question}</span>
      <button className="btn btn-ghost" disabled={pending} onClick={onConfirm}>
        {pending ? pendingLabel : confirmLabel}
      </button>
      <button className="btn btn-secondary" onClick={onCancel}>ביטול</button>
    </span>
  );
}
