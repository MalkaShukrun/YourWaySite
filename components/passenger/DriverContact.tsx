import { Landmark, Phone } from "lucide-react";
import type { DriverBank } from "@/lib/rides";

// `bank` is passed on the payments screen only: the driver's account, or
// null when she hasn't added one.
type Props = { name: string; phone: string | null; email: string; bank?: DriverBank | null };

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
      {bank !== undefined && <BankDetails bank={bank} />}
    </div>
  );
}

function BankDetails({ bank }: { bank: DriverBank | null }) {
  if (!bank) return <div className="bank-details is-missing">הנהגת עוד לא הוסיפה פרטי חשבון</div>;
  return (
    <div className="bank-details">
      <Landmark className="icon" size={15} strokeWidth={1.8} />
      <div>
        <b>{bank.holder}</b>
        <span>{bank.details}</span>
      </div>
    </div>
  );
}
