import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="btn btn-secondary">
        <LogOut className="icon" size={18} strokeWidth={1.8} /> התנתקות
      </button>
    </form>
  );
}
