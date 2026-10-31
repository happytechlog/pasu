import nodemailer, { type Transporter } from "nodemailer";

// Shared SMTP sender (web: invitations, test alerts / worker: alerts).
// Local defaults point to Mailpit (http://localhost:8025).
const globalForMail = globalThis as unknown as { mailTransport?: Transporter };

function getTransport() {
  if (!globalForMail.mailTransport) {
    const user = process.env.SMTP_USER;
    globalForMail.mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return globalForMail.mailTransport;
}

export async function sendMail(msg: { to: string; subject: string; text: string; html?: string }) {
  await getTransport().sendMail({
    from: process.env.SMTP_FROM ?? "Uptime Monitor <alerts@localhost>",
    ...msg,
  });
}
