"use client";

import { useState, useTransition } from "react";
import { deleteGroup, setGroupActive } from "@/app/(app)/admin/actions";
import { GroupDialog } from "@/components/admin/GroupDialog";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { Toast } from "@/components/ui/Toast";

type Props = { group: { id: string; origin: string; destination: string }; active: boolean; routeCount: number };

// Edit, hide / show, or delete a group — delete only when no route uses it
// (asks first).
export function GroupActions({ group, active, routeCount }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError("");
      const result = await action();
      if (result.error) setError(result.error);
      setConfirming(false);
    });

  if (confirming) {
    return (
      <ConfirmInline
        question="למחוק את הקבוצה?"
        confirmLabel="כן, למחוק"
        pendingLabel="מוחק..."
        pending={pending}
        onConfirm={() => run(() => deleteGroup(group.id))}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <div className="row-actions">
      <GroupDialog group={group} />
      <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => setGroupActive(group.id, !active))}>
        {active ? "הסתרה" : "הצגה"}
      </button>
      {routeCount === 0 && (
        <button className="btn btn-ghost" disabled={pending} onClick={() => setConfirming(true)}>מחיקה</button>
      )}
      <Toast message={error} />
    </div>
  );
}
