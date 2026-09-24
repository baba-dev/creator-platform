import { randomUUID } from "node:crypto";
import { connect, type TLSSocket } from "node:tls";
import type { ServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { senderForKind } from "./index";

type SmtpResponse = { code: number; lines: string[] };

class SmtpSession {
  private socket: TLSSocket;
  private buffer = "";
  private waiters: Array<(response: SmtpResponse) => void> = [];

  private constructor(socket: TLSSocket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
  }

  static async connect(env: ServerEnv): Promise<SmtpSession> {
    const socket = connect({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      servername: env.SMTP_HOST,
      rejectUnauthorized: true,
    });
    socket.setTimeout(env.SMTP_SOCKET_TIMEOUT_MS);
    const session = new SmtpSession(socket);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      socket.once("error", onError);
      socket.once("secureConnect", () => {
        socket.off("error", onError);
        resolve();
      });
    });
    const greeting = await session.read();
    if (greeting.code !== 220)
      throw new Error(`SMTP greeting failed: ${greeting.code}`);
    return session;
  }

  private flush(): void {
    const lines = this.buffer.split("\r\n");
    this.buffer = lines.pop() ?? "";
    if (!lines.length) return;
    const complete: string[] = [];
    for (const line of lines) {
      complete.push(line);
      const match = /^(\d{3})([ -])/.exec(line);
      if (match?.[2] === " ") {
        const code = Number(match[1]);
        const waiter = this.waiters.shift();
        if (waiter) waiter({ code, lines: complete.splice(0) });
      }
    }
  }

  private read(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("SMTP response timed out")),
        30_000,
      );
      this.waiters.push((response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  async command(command: string, expected: number[]): Promise<SmtpResponse> {
    this.socket.write(`${command}\r\n`);
    const response = await this.read();
    if (!expected.includes(response.code)) {
      const error = new Error(
        `SMTP command failed with status ${response.code}`,
      );
      Object.assign(error, { smtpCode: response.code });
      throw error;
    }
    return response;
  }

  async sendData(data: string): Promise<void> {
    this.socket.write(data);
    const response = await this.read();
    if (response.code !== 250) {
      const error = new Error(`SMTP DATA failed with status ${response.code}`);
      Object.assign(error, { smtpCode: response.code });
      throw error;
    }
  }

  close(): void {
    this.socket.end();
  }
}

function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function dotStuff(value: string): string {
  return value.replace(/(^|\r\n)\./g, "$1..");
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
  const session = await SmtpSession.connect(env);
  const providerMessageId = `<${randomUUID()}@aiwamediagroup.com>`;
  try {
    await session.command(`EHLO ${env.SMTP_EHLO_NAME}`, [250]);
    await session.command("AUTH LOGIN", [334]);
    await session.command(Buffer.from(env.SMTP_USER).toString("base64"), [334]);
    await session.command(
      Buffer.from(env.SMTP_PASSWORD).toString("base64"),
      [235],
    );
    await session.command(`MAIL FROM:<${headerSafe(message.from)}>`, [250]);
    await session.command(`RCPT TO:<${headerSafe(message.to)}>`, [250, 251]);
    await session.command("DATA", [354]);

    const boundary = `aiwa-${randomUUID()}`;
    const mime = [
      `From: Aiwa Creators <${headerSafe(message.from)}>`,
      `To: <${headerSafe(message.to)}>`,
      `Subject: ${headerSafe(message.subject)}`,
      `Message-ID: ${providerMessageId}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    await session.sendData(`${dotStuff(mime)}\r\n.\r\n`);
    await session.command("QUIT", [221]);
    return { providerMessageId };
  } finally {
    session.close();
  }
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
  const smtpCode =
    typeof error === "object" &&
    error !== null &&
    "smtpCode" in error &&
    typeof error.smtpCode === "number"
      ? error.smtpCode
      : undefined;

  if (smtpCode && smtpCode >= 500) {
    return { retryable: false, code: `SMTP_${smtpCode}`, message };
  }
  return {
    retryable: true,
    code: smtpCode ? `SMTP_${smtpCode}` : "SMTP_TRANSPORT",
    message,
  };
}
