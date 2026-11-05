import { z } from "zod";

// A ride group: from one place on the list to another (SRS §8, admins only).
export const groupSchema = z
  .object({
    originId: z.uuid("יש לבחור נקודת מוצא"),
    destinationId: z.uuid("יש לבחור יעד"),
  })
  .refine((v) => v.originId !== v.destinationId, { path: ["destinationId"], message: "היעד חייב להיות שונה מנקודת המוצא" });

export type GroupValues = z.infer<typeof groupSchema>;
