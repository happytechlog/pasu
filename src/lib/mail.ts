import nodemailer, { type Transporter } from "nodemailer";

// Shared SMTP sender (web: invitations, test alerts / worker: alerts).
// Local defaults point to Mailpit (http://localhost:8025).
const globalForMail = globalThis as unknown as { mailTransport?: Transporter };

const DEFAULT_SMTP_PORT = 1025;

// nodemailer's own defaults are 2 minutes to connect and 10 minutes on the
// socket. Alerts are awaited by the worker and the web "테스트 발송", so a
// hung SMTP host must fail fast instead.
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

/** SMTP_PORT as a valid port; unset, empty or garbage falls back to the default. */
export function smtpPort(raw: string | undefined): number {
  const n = Number(raw);
  return raw?.trim() && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_SMTP_PORT;
}

function getTransport() {
  if (!globalForMail.mailTransport) {
    const user = process.env.SMTP_USER;
    const port = smtpPort(process.env.SMTP_PORT);
    globalForMail.mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port,
      secure: port === 465,
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
  }
  return globalForMail.mailTransport;
}

export async function sendMail(msg: { to: string; subject: string; text: string; html?: string }) {
  await getTransport().sendMail({
    from: process.env.SMTP_FROM ?? "Pasu Monitor <alerts@localhost>",
    ...msg,
  });
}
