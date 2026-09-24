import { createHash } from "node:crypto";
import { connect, type TLSSocket } from "node:tls";
import { db, type Prisma } from "@aiwa/db";
import type { ServerEnv } from "@aiwa/config";

export type MailKind = "SECURITY" | "ROUTINE";
export type MailPriority = "HIGH" | "NORMAL";

export type MailDraft = {
  kind: MailKind;
  template: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  sensitive?: boolean;
  organizationId?: string | null;
  userId?: string | null;
  priority?: MailPriority;
  idempotencyKey: string;
};

type MailDb = typeof db | Prisma.TransactionClient;

export function senderForKind(env: ServerEnv, kind: MailKind): string {
  return kind === "SECURITY"
    ? env.MAIL_SECURITY_FROM_ADDRESS
    : env.MAIL_ROUTINE_FROM_ADDRESS;
}

export function mailJobId(id: string): string {
  return `mail:${id}`;
}

export function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function enqueueMail(
  input: MailDraft,
  client: MailDb = db,
): Promise<{ id: string; created: boolean }> {
  const to = normalizeRecipient(input.to);
  try {
    const row = await client.mailMessage.create({
      data: {
        kind: input.kind,
        priority: input.priority ?? (input.kind === "SECURITY" ? "HIGH" : "NORMAL"),
        template: input.template,
        recipient: to,
        subject: input.subject,
        textBody: input.text,
        htmlBody: input.html,
        sensitive: input.sensitive ?? input.kind === "SECURITY",
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
      select: { id: true },
    });
    return { id: row.id, created: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await client.mailMessage.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
    }
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
}

function emailShell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ee;color:#171717;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #ddd8cc;border-radius:18px;padding:28px"><div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b675e;margin-bottom:12px">Aiwa Creators</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 18px">${escapeHtml(title)}</h1>${body}<p style="font-size:12px;color:#77736b;margin:28px 0 0">This is an automated message from Aiwa Creators.</p></div></div></body></html>`;
}

export function verificationEmail(input: {
  to: string;
  verificationUrl: string;
  userId?: string;
}): MailDraft {
  const safeUrl = escapeHtml(input.verificationUrl);
  return {
    kind: "SECURITY",
    template: "auth.verify_email.v1",
    to: input.to,
    subject: "Verify your Aiwa Creators email",
    text: `Verify your email address to activate workspace access: ${input.verificationUrl}\n\nIf you did not request this, you can ignore this message.`,
    html: emailShell(
      "Verify your email",
      `<p style="line-height:1.6">Confirm this email address to activate workspace access.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#171717;color:#fff;text-decoration:none;font-weight:700">Verify email</a></p><p style="font-size:12px;color:#77736b;word-break:break-all">If the button does not work, copy this link:<br>${safeUrl}</p>`,
    ),
    sensitive: true,
    userId: input.userId,
    idempotencyKey: `verify:${fingerprint(input.verificationUrl)}`,
  };
}

export function teamMemberAddedEmail(input: {
  to: string;
  organizationName: string;
  role: string;
  organizationId: string;
  userId: string;
  membershipId: string;
}): MailDraft {
  return {
    kind: "SECURITY",
    template: "organization.member_added.v1",
    to: input.to,
    subject: `You were added to ${input.organizationName} on Aiwa Creators`,
    text: `You were added to ${input.organizationName} with role ${input.role}. Sign in to Aiwa Creators to access the workspace.`,
    html: emailShell(
      "You joined a workspace",
      `<p style="line-height:1.6">You were added to <strong>${escapeHtml(input.organizationName)}</strong> with role <strong>${escapeHtml(input.role)}</strong>.</p><p style="line-height:1.6">Sign in to Aiwa Creators to access the workspace.</p>`,
    ),
    organizationId: input.organizationId,
    userId: input.userId,
    idempotencyKey: `membership-added:${input.membershipId}`,
  };
}

export function generationCompletedEmail(input: {
  to: string;
  assetUrl: string;
  userId: string;
  organizationId: string;
  generationJobId: string;
}): MailDraft {
  const safeUrl = escapeHtml(input.assetUrl);
  return {
    kind: "ROUTINE",
    template: "generation.completed.v1",
    to: input.to,
    subject: "Your Aiwa Creators generation is ready",
    text: `Your generation is ready: ${input.assetUrl}`,
    html: emailShell(
      "Your generation is ready",
      `<p style="line-height:1.6">Your media has finished generating.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#171717;color:#fff;text-decoration:none;font-weight:700">Open generation</a></p>`,
    ),
    organizationId: input.organizationId,
    userId: input.userId,
    sensitive: false,
    idempotencyKey: `generation-completed:${input.generationJobId}`,
  };
}

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
    if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.code}`);
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
      const error = new Error(`SMTP command failed with status ${response.code}`);
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
  const providerMessageId = `<${crypto.randomUUID()}@aiwamediagroup.com>`;
  try {
    await session.command(`EHLO ${env.SMTP_EHLO_NAME}`, [250]);
    await session.command("AUTH LOGIN", [334]);
    await session.command(Buffer.from(env.SMTP_USER).toString("base64"), [334]);
    await session.command(Buffer.from(env.SMTP_PASSWORD).toString("base64"), [235]);
    await session.command(`MAIL FROM:<${headerSafe(message.from)}>`, [250]);
    await session.command(`RCPT TO:<${headerSafe(message.to)}>`, [250, 251]);
    await session.command("DATA", [354]);

    const boundary = `aiwa-${crypto.randomUUID()}`;
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
