import { z } from "zod";

// Matches the places_names check in supabase/migrations/0040.
export const PLACE_PART_MAX = 40;

const part = z.string().trim().min(2, "לפחות 2 תווים").max(PLACE_PART_MAX, `עד ${PLACE_PART_MAX} תווים`);

// A place on the list: a city and a neighborhood or area inside it.
export const placeSchema = z.object({
  city: part.refine((v) => !v.includes(","), "בלי פסיק בשם העיר"),
  neighborhood: part,
});

export type PlaceValues = z.infer<typeof placeSchema>;
