import type { ServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import { senderForKind } from "./index";

let transporter: Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options> | null = null;
let transporterFingerprint = "";

function getTransporter(
  env: ServerEnv,
): Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options> {
  const fingerprint = [
    env.SMTP_HOST,
    env.SMTP_PORT,
    env.SMTP_USER,
    env.SMTP_POOL_MAX_CONNECTIONS,
    env.SMTP_POOL_MAX_MESSAGES,
  ].join(":");

  if (transporter && transporterFingerprint === fingerprint) return transporter;

  transporter?.close();
  transporterFingerprint = fingerprint;
  const nextTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: true,
    pool: true,
    maxConnections: env.SMTP_POOL_MAX_CONNECTIONS,
    maxMessages: env.SMTP_POOL_MAX_MESSAGES,
    connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    tls: {
      servername: env.SMTP_HOST,
      rejectUnauthorized: true,
    },
  });

  transporter = nextTransporter;
  return nextTransporter;
}

export async function verifySmtpTransport(env: ServerEnv): Promise<void> {
  await getTransporter(env).verify();
}

export async function closeSmtpTransport(): Promise<void> {
  transporter?.close();
  transporter = null;
  transporterFingerprint = "";
}

export async function sendMailViaSmtp(
  env: ServerEnv,
  message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<{ providerMessageId: string }> {
  const info = await getTransporter(env).sendMail({
    from: { name: "Aiwa Creators", address: message.from },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return { providerMessageId: info.messageId };
}

export async function processMailMessage(
  env: ServerEnv,
  id: string,
  attemptNumber: number,
  maxAttempts: number,
): Promise<{ sent: boolean; terminal: boolean }> {
  const current = await db.mailMessage.findUnique({ where: { id } });
  if (!current) return { sent: false, terminal: true };
  if (["SENT", "FAILED", "SUPPRESSED"].includes(current.status)) {
    return { sent: current.status === "SENT", terminal: true };
  }

  const claimed = await db.mailMessage.updateMany({
    where: { id, status: { in: ["PENDING", "QUEUED", "RETRY"] } },
    data: {
      status: "SENDING",
      sendingAt: new Date(),
      attemptCount: { increment: 1 },
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count !== 1) return { sent: false, terminal: false };

  const message = await db.mailMessage.findUniqueOrThrow({ where: { id } });
  try {
    const result = await sendMailViaSmtp(env, {
      from: senderForKind(env, message.kind),
      to: message.recipient,
      subject: message.subject,
      text: message.textBody,
      html: message.htmlBody,
    });
    await db.mailMessage.update({
      where: { id },
      data: {
        status: "SENT",
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        nextAttemptAt: null,
        sendingAt: null,
        textBody: message.sensitive
          ? "[redacted after delivery]"
          : message.textBody,
        htmlBody: message.sensitive
          ? "[redacted after delivery]"
          : message.htmlBody,
      },
    });
    return { sent: true, terminal: true };
  } catch (error) {
    const failure = classifySmtpFailure(error);
    const terminal = !failure.retryable || attemptNumber >= maxAttempts;
    const highDelays = [30_000, 120_000, 600_000, 1_800_000];
    const normalDelays = [60_000, 300_000, 1_200_000, 3_600_000];
    const delays = message.priority === "HIGH" ? highDelays : normalDelays;
    const delay =
      delays[Math.min(Math.max(attemptNumber - 1, 0), delays.length - 1)] ??
      delays[delays.length - 1]!;
    await db.mailMessage.update({
      where: { id },
      data: {
        status: terminal ? "FAILED" : "RETRY",
        failedAt: terminal ? new Date() : null,
        nextAttemptAt: terminal ? null : new Date(Date.now() + delay),
        sendingAt: null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message.slice(0, 2000),
      },
    });
    if (!terminal) throw error;
    return { sent: false, terminal: true };
  }
}

export function classifySmtpFailure(error: unknown): {
  retryable: boolean;
  code: string;
  message: string;
} {
  const message = error instanceof Error ? error.message : "Unknown SMTP error";
  const responseCode =
    typeof error === "object" &&
    error !== null &&
    "responseCode" in error &&
    typeof error.responseCode === "number"
      ? error.responseCode
      : undefined;
  const transportCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;

  if (responseCode && responseCode >= 500) {
    return { retryable: false, code: `SMTP_${responseCode}`, message };
  }

  if (transportCode === "EENVELOPE" && responseCode && responseCode >= 400) {
    return {
      retryable: responseCode < 500,
      code: `SMTP_${responseCode}`,
      message,
    };
  }

  return {
    retryable: true,
    code: responseCode
      ? `SMTP_${responseCode}`
      : transportCode
        ? `SMTP_${transportCode}`
        : "SMTP_TRANSPORT",
    message,
  };
}
