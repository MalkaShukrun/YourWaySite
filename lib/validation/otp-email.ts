import { z } from "zod";

// An address on the personal-code list, lower-case as Supabase stores it.
export const otpEmailSchema = z.string().trim().toLowerCase().pipe(z.email("כתובת מייל לא תקינה").max(120, "עד 120 תווים"));

export const personalCodeSchema = z.string().trim().regex(/^\d{8}$/);
