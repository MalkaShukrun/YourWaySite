import { Phone } from "lucide-react";
import { iconProps } from "@/components/ui/icon";

type Props = { name: string; phone: string | null; email: string | null };

// Quick-dial driver contact shown next to each booking (SRS §2).
export function DriverContact({ name, phone, email }: Props) {
  return (
    <div className="inline-driver-contact">
      <strong>{name}</strong>
      {phone && (
        <a href={`tel:${phone}`}><Phone {...iconProps} size={16} />{phone}</a>
      )}
      {email && <a href={`mailto:${email}`}>{email}</a>}
    </div>
  );
}
