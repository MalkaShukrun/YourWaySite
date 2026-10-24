import { Phone } from "lucide-react";

// Quick-dial driver contact shown next to each booking (SRS §2).
export function DriverContact({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  return (
    <div className="inline-driver-contact">
      <strong>{name}</strong>
      {phone && (
        <a href={`tel:${phone}`}><Phone className="icon" size={16} strokeWidth={1.8} />{phone}</a>
      )}
      <a href={`mailto:${email}`}>{email}</a>
    </div>
  );
}
