import nodemailer from "nodemailer";

// Sends through a Gmail account with an App Password. Port 465: Edge Functions
// can't connect out on 25 or 587. ca is for a network that re-signs TLS with its
// own certificate; leave it out in production.
export function gmailSender(user: string, appPassword: string, ca?: string) {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
    ...(ca && { tls: { ca } }),
  });
  return (mail: { to: string; subject: string; text: string; html: string }) =>
    transport.sendMail({ from: `בדרך שלך <${user}>`, ...mail });
}
