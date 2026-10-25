import { Landmark, Phone } from "lucide-react";
import type { DriverBankAccount } from "@/lib/rides";
import { iconProps } from "@/components/ui/icon";

// `bank` is passed on the payments screen only: the driver's account, or
// null when she hasn't added one.
type Props = { name: string; phone: string | null; email: string; bank?: DriverBankAccount | null };

// Quick-dial driver contact shown next to each booking (SRS §2), plus her
// payment account on the payments screen.
export function DriverContact({ name, phone, email, bank }: Props) {
  return (
    <div className="inline-driver-contact">
      <strong>{name}</strong>
      {phone && (
        <a href={`tel:${phone}`}><Phone {...iconProps} size={16} />{phone}</a>
      )}
      <a href={`mailto:${email}`}>{email}</a>
      {bank !== undefined && <BankDetails bank={bank} />}
    </div>
  );
}

function BankDetails({ bank }: { bank: DriverBankAccount | null }) {
  if (!bank) return <div className="bank-details is-missing">הנהגת עוד לא הוסיפה פרטי חשבון</div>;
  return (
    <div className="bank-details">
      <Landmark {...iconProps} size={15} />
      <div>
        <b>{bank.holder}</b>
        <span>{bank.details}</span>
      </div>
    </div>
  );
}
