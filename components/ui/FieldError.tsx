// A form field's validation message, under its input.
export function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}
