"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Contact, Mail, User } from "lucide-react";
import { sendContactMessage } from "@/app/contact/actions";
import { contactSchema, type ContactValues } from "@/lib/validation/contact";
import { Toast } from "@/components/ui/Toast";
import { iconProps } from "@/components/ui/icon";
import { FieldError } from "@/components/ui/FieldError";

const EMPTY: ContactValues = { name: "", email: "", message: "" };

// "צרי קשר" in every header (app top bar and login page): a small modal
// whose message is emailed to support.
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
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <form
            className="modal-card small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-dialog-title"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <button type="button" className="modal-close" onClick={close} aria-label="סגירה">×</button>
            <span className="modal-icon"><Contact {...iconProps} size={20} /></span>
            <h2 id="contact-dialog-title">צרי קשר</h2>
            <p>צריכה עזרה? כתבי לנו ונחזור אלייך</p>
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
            {serverError && <p className="form-alert" role="alert">{serverError}</p>}
            <button type="submit" className="btn btn-primary full-button" disabled={pending}>
              {pending ? "שולחת..." : "שליחה"}
            </button>
          </form>
        </div>,
        document.body,
      )}
      <Toast message={done ? "ההודעה נשלחה, נחזור אלייך בהקדם" : ""} id={done} />
    </>
  );
}
