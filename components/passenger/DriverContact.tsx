import { Phone } from "lucide-react";

type Props = { name: string; phone: string | null; email: string; bank?: string };

// Quick-dial driver contact shown next to each booking (SRS §2), plus her
// payment account on the payments screen.
export function DriverContact({ name, phone, email, bank }: Props) {
  return (
    <div className="inline-driver-contact">
      <strong>{name}</strong>
      {phone && (
        <a href={`tel:${phone}`}><Phone className="icon" size={16} strokeWidth={1.8} />{phone}</a>
      )}
      <a href={`mailto:${email}`}>{email}</a>
      {bank && <small>{bank}</small>}
    </div>
  );
}
