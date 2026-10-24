import { z } from "zod";

const place = z.string().trim().min(2, "לפחות 2 תווים").max(40, "עד 40 תווים");

// A ride group: from one city/area to another (SRS §8, admins only).
export const groupSchema = z
  .object({ origin: place, destination: place })
  .refine((v) => v.origin !== v.destination, { path: ["destination"], message: "היעד חייב להיות שונה מנקודת המוצא" });

export type GroupValues = z.infer<typeof groupSchema>;
