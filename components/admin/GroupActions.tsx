"use client";

import { deleteGroup, setGroupActive } from "@/app/(app)/admin/actions";
import { GroupDialog } from "@/components/admin/GroupDialog";
import { RowActions } from "@/components/admin/RowActions";
import type { Place } from "@/lib/admin/data";

type Props = {
  group: { id: string; originId: string; destinationId: string };
  places: Place[];
  active: boolean;
  routeCount: number;
};

// Edit, hide / show, or delete a group — delete only when no route uses it
// (asks first).
export function GroupActions({ group, places, active, routeCount }: Props) {
  return (
    <RowActions deleteQuestion="למחוק את הקבוצה?" onDelete={routeCount === 0 ? () => deleteGroup(group.id) : undefined}>
      {(run, pending) => (
        <>
          <GroupDialog group={group} places={places} />
          <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => setGroupActive(group.id, !active))}>
            {active ? "הסתרה" : "הצגה"}
          </button>
        </>
      )}
    </RowActions>
  );
}
