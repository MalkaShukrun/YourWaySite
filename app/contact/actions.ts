"use server";

import { requireUser } from "@/lib/auth";
import { firstIssue, GENERIC_ERROR } from "@/lib/action-errors";
import { SUPPORT_EMAIL } from "@/lib/support";
import { contactSchema, type ContactValues } from "@/lib/validation/contact";

// Sends the contact form to CONTACT_TO_EMAIL (default: SUPPORT_EMAIL) through Resend's REST API.
// Reply-To is the sender, so answering the email reaches her directly.
// CONTACT_FROM_EMAIL must be on a domain verified in Resend; without one,
// Resend's test sender only delivers to the Resend account's own address.
// Signed-in users only, so visitors can't use the form to flood the inbox.
export async function sendContactMessage(values: ContactValues) {
  await requireUser();
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendContactMessage: RESEND_API_KEY is not set");
    return { error: GENERIC_ERROR };
  }

  const { name, email, message } = parsed.data;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `בדרך שלך <${process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev"}>`,
      to: [process.env.CONTACT_TO_EMAIL || SUPPORT_EMAIL],
      reply_to: email,
      subject: `פנייה חדשה מ־${name}`,
      text: `${name} <${email}>\n\n${message}`,
    }),
  });

  if (!response.ok) {
    console.error("sendContactMessage: Resend failed", response.status, await response.text());
    return { error: GENERIC_ERROR };
  }
  return {};
}
