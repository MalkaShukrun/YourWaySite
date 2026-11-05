"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Contact, Mail, User } from "lucide-react";
import { sendContactMessage } from "@/app/contact/actions";
import { contactSchema, type ContactValues } from "@/lib/validation/contact";
import { ModalForm } from "@/components/ui/ModalForm";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";

const EMPTY: ContactValues = { name: "", email: "", message: "" };

// "צרי קשר" in the app's top bar, after sign-in: a small modal whose message
// is emailed to support.
export function ContactButton() {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(0);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: EMPTY,
  });

  const close = () => {
    setOpen(false);
    setServerError("");
    reset(EMPTY);
  };

  const onSubmit = (values: ContactValues) =>
    startTransition(async () => {
      setServerError("");
      const result = await sendContactMessage(values);
      if (result.error) return setServerError(result.error);
      close();
      setDone((n) => n + 1);
    });

  return (
    <>
      <button type="button" className="btn btn-secondary contact-button" onClick={() => setOpen(true)}>
        <Contact {...iconProps} size={18} /> <span>צרי קשר</span>
      </button>

      {/* Portaled to <body>: the top bar's backdrop-filter would otherwise
          trap the fixed backdrop inside the header. */}
      {open && createPortal(
        <ModalForm
          icon={<Contact {...iconProps} size={20} />}
          title="צרי קשר"
          description="צריכה עזרה? כתבי לנו ונחזור אלייך"
          error={serverError}
          submitLabel={pending ? "שולחת..." : "שליחה"}
          submitDisabled={pending}
          onSubmit={handleSubmit(onSubmit)}
          onClose={close}
        >
          <div className="form-grid compact contact-dialog-fields">
            <label className="field">
              <span>שם</span>
              <div className="input-shell"><User {...iconProps} size={20} /><input {...register("name")} autoComplete="name" autoFocus /></div>
              <FieldError message={errors.name?.message} />
            </label>
            <label className="field">
              <span>מייל</span>
              <div className="input-shell"><Mail {...iconProps} size={20} /><input {...register("email")} type="email" dir="ltr" autoComplete="email" /></div>
              <FieldError message={errors.email?.message} />
            </label>
            <label className="field">
              <span>הודעה</span>
              <div className="input-shell textarea-shell"><textarea {...register("message")} rows={5} /></div>
              <FieldError message={errors.message?.message} />
            </label>
          </div>
        </ModalForm>,
        document.body,
      )}
      <Toast message={done ? "ההודעה נשלחה, נחזור אלייך בהקדם" : ""} id={done} />
    </>
  );
}
