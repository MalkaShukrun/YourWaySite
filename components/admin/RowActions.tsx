"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Toast } from "@/components/ui/Toast";

type Action = () => Promise<{ error?: string }>;

type Props = {
  deleteQuestion: string;
  onDelete?: Action; // left out when the row can't be deleted
  children: (run: (action: Action) => void, pending: boolean) => ReactNode;
};

// A row's buttons on group management: its own, then "מחיקה", which asks
// first. One action runs at a time; its error shows as a toast.
export function RowActions({ deleteQuestion, onDelete, children }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: Action) =>
    startTransition(async () => {
      setError("");
      const result = await action();
      if (result.error) setError(result.error);
      setConfirming(false);
    });

  if (confirming && onDelete) {
    return (
      <ConfirmInline
        question={deleteQuestion}
        confirmLabel="כן, למחוק"
        pendingLabel="מוחק..."
        pending={pending}
        onConfirm={() => run(onDelete)}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <div className="row-actions">
      {children(run, pending)}
      {onDelete && (
        <button className="btn btn-ghost" disabled={pending} onClick={() => setConfirming(true)}>מחיקה</button>
      )}
      <Toast message={error} />
    </div>
  );
}
