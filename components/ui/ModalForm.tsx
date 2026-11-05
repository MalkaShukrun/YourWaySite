"use client";

import { useId, type FormEventHandler, type ReactNode } from "react";

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  error: string; // the server's answer, under the fields
  submitLabel: string;
  submitDisabled: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  children: ReactNode; // the fields
};

// The design's small modal form: a close button, an icon, a title with a line
// under it, the fields, and a full-width submit button. Clicking outside it
// closes it.
export function ModalForm({ icon, title, description, error, submitLabel, submitDisabled, onSubmit, onClose, children }: Props) {
  const titleId = useId();
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card small-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={onSubmit} noValidate>
        <button type="button" className="modal-close" onClick={onClose} aria-label="סגירה">×</button>
        <span className="modal-icon">{icon}</span>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        {children}
        {error && <p className="form-alert" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary full-button" disabled={submitDisabled}>{submitLabel}</button>
      </form>
    </div>
  );
}
