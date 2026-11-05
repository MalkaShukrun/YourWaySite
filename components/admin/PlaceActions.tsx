"use client";

import { deletePlace } from "@/app/(app)/admin/actions";
import { PlaceDialog } from "@/components/admin/PlaceDialog";
import { RowActions } from "@/components/admin/RowActions";

type Props = { place: { id: string; city: string; neighborhood: string }; groupCount: number };

// Edit or delete a place — delete only when no group uses it (asks first).
export function PlaceActions({ place, groupCount }: Props) {
  return (
    <RowActions deleteQuestion="למחוק את המקום?" onDelete={groupCount === 0 ? () => deletePlace(place.id) : undefined}>
      {() => <PlaceDialog place={place} />}
    </RowActions>
  );
}
