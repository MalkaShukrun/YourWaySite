import { z } from "zod";

// The "צרי קשר" form in the header.
export const contactSchema = z.object({
  name: z.string().trim().min(2, "לפחות 2 תווים").max(60, "עד 60 תווים"),
  email: z.email("כתובת מייל לא תקינה").max(120, "עד 120 תווים"),
  message: z.string().trim().min(5, "לפחות 5 תווים").max(2000, "עד 2000 תווים"),
});

export type ContactValues = z.infer<typeof contactSchema>;
