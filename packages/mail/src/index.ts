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

export async function enqueueMail(
  input: MailDraft,
  client: MailDb = db,
): Promise<{ id: string; created: boolean }> {
  const to = normalizeRecipient(input.to);
  try {
    const row = await client.mailMessage.create({
      data: {
        kind: input.kind,
        priority:
          input.priority ?? (input.kind === "SECURITY" ? "HIGH" : "NORMAL"),
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
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

function emailShell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ee;color:#171717;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #ddd8cc;border-radius:18px;padding:28px"><div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b675e;margin-bottom:12px">Aiwa Creators</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 18px">${escapeHtml(title)}</h1>${body}<p style="font-size:12px;color:#77736b;margin:28px 0 0">This is an automated message from Aiwa Creators.</p></div></div></body></html>`;
}

export function verificationEmail(input: {
  to: string;
  verificationUrl: string;
  idempotencyKey: string;
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
    idempotencyKey: input.idempotencyKey,
  };
}

export function passwordResetEmail(input: {
  to: string;
  resetUrl: string;
  idempotencyKey: string;
  userId?: string;
}): MailDraft {
  const safeUrl = escapeHtml(input.resetUrl);
  return {
    kind: "SECURITY",
    template: "auth.password_reset.v1",
    to: input.to,
    subject: "Reset your Aiwa Creators password",
    text: `Use this link to reset your Aiwa Creators password: ${input.resetUrl}\n\nIf you did not request this, ignore this email and your password will remain unchanged.`,
    html: emailShell(
      "Reset your password",
      `<p style="line-height:1.6">A password reset was requested for your Aiwa Creators account.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#171717;color:#fff;text-decoration:none;font-weight:700">Reset password</a></p><p style="font-size:12px;color:#77736b;word-break:break-all">If the button does not work, copy this link:<br>${safeUrl}</p><p style="line-height:1.6">If you did not request this, you can safely ignore this message.</p>`,
    ),
    sensitive: true,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
  };
}

export function securityEventEmail(input: {
  to: string;
  userId: string;
  event:
    | "PASSWORD_RESET"
    | "MFA_ENABLED"
    | "MFA_DISABLED"
    | "BACKUP_CODES_REGENERATED";
  idempotencyKey: string;
}): MailDraft {
  const content = {
    PASSWORD_RESET: {
      subject: "Your Aiwa Creators password was changed",
      title: "Password changed",
      message:
        "Your account password was successfully changed and existing sessions were revoked. If this was not you, contact your administrator immediately.",
    },
    MFA_ENABLED: {
      subject: "Two-factor authentication enabled",
      title: "Two-factor authentication enabled",
      message:
        "Authenticator-based two-factor authentication was enabled on your Aiwa Creators account.",
    },
    MFA_DISABLED: {
      subject: "Two-factor authentication disabled",
      title: "Two-factor authentication disabled",
      message:
        "Two-factor authentication was disabled on your Aiwa Creators account. If this was not you, contact your administrator immediately.",
    },
    BACKUP_CODES_REGENERATED: {
      subject: "New two-factor recovery codes generated",
      title: "Recovery codes regenerated",
      message:
        "New two-factor recovery codes were generated for your Aiwa Creators account. Previous recovery codes are no longer valid.",
    },
  }[input.event];

  return {
    kind: "SECURITY",
    template: `auth.security_event.${input.event.toLowerCase()}.v1`,
    to: input.to,
    subject: content.subject,
    text: content.message,
    html: emailShell(
      content.title,
      `<p style="line-height:1.6">${escapeHtml(content.message)}</p>`,
    ),
    sensitive: false,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
  };
}

export function accountAdministrationEmail(input: {
  to: string;
  userId: string;
  event:
    | "PLATFORM_ROLE_CHANGED"
    | "ACCOUNT_DISABLED"
    | "ACCOUNT_ENABLED"
    | "SESSIONS_REVOKED";
  detail: string;
  eventVersion: string;
}): MailDraft {
  const content = {
    PLATFORM_ROLE_CHANGED: {
      subject: "Your Aiwa Creators platform role changed",
      title: "Platform role changed",
    },
    ACCOUNT_DISABLED: {
      subject: "Your Aiwa Creators account was disabled",
      title: "Account disabled",
    },
    ACCOUNT_ENABLED: {
      subject: "Your Aiwa Creators account was reactivated",
      title: "Account reactivated",
    },
    SESSIONS_REVOKED: {
      subject: "Aiwa Creators sessions were revoked",
      title: "Sessions revoked",
    },
  }[input.event];

  return {
    kind: "SECURITY",
    template: `account.admin_${input.event.toLowerCase()}.v1`,
    to: input.to,
    subject: content.subject,
    text: input.detail,
    html: emailShell(
      content.title,
      `<p style="line-height:1.6">${escapeHtml(input.detail)}</p>`,
    ),
    userId: input.userId,
    sensitive: false,
    idempotencyKey: `account:${input.userId}:${input.event.toLowerCase()}:${input.eventVersion}`,
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

export function teamMembershipChangedEmail(input: {
  to: string;
  organizationName: string;
  organizationId: string;
  userId: string;
  membershipId: string;
  event:
    | "ROLE_CHANGED"
    | "CAP_CHANGED"
    | "REMOVED"
    | "OWNER_GRANTED"
    | "OWNER_RELEASED";
  detail?: string;
  eventVersion: string;
}): MailDraft {
  const content = {
    ROLE_CHANGED: {
      subject: `Your role changed in ${input.organizationName}`,
      title: "Workspace role changed",
      message: input.detail ?? "Your workspace role was changed.",
    },
    CAP_CHANGED: {
      subject: `Your spending limit changed in ${input.organizationName}`,
      title: "Spending limit changed",
      message: input.detail ?? "Your workspace spending limit was changed.",
    },
    REMOVED: {
      subject: `Your access to ${input.organizationName} was removed`,
      title: "Workspace access removed",
      message: "Your membership in this workspace was removed.",
    },
    OWNER_GRANTED: {
      subject: `You are now the owner of ${input.organizationName}`,
      title: "Workspace ownership transferred to you",
      message: "You are now the organization owner for this workspace.",
    },
    OWNER_RELEASED: {
      subject: `Ownership changed for ${input.organizationName}`,
      title: "Workspace ownership transferred",
      message:
        "You are no longer the organization owner. Your workspace membership remains active.",
    },
  }[input.event];

  return {
    kind: "SECURITY",
    template: `organization.membership_${input.event.toLowerCase()}.v1`,
    to: input.to,
    subject: content.subject,
    text: `${content.message} Organization: ${input.organizationName}.`,
    html: emailShell(
      content.title,
      `<p style="line-height:1.6">${escapeHtml(content.message)}</p><p style="line-height:1.6"><strong>Workspace:</strong> ${escapeHtml(input.organizationName)}</p>`,
    ),
    organizationId: input.organizationId,
    userId: input.userId,
    sensitive: false,
    idempotencyKey: `membership:${input.membershipId}:${input.event.toLowerCase()}:${input.eventVersion}`,
  };
}

export function billingStatusEmail(input: {
  to: string;
  organizationName: string;
  organizationId: string;
  paymentId: string;
  status: "CONFIRMED" | "REJECTED" | "REVERSED";
  amountBaisa: bigint;
  userId: string;
  detail?: string;
}): MailDraft {
  const amountOmr = (Number(input.amountBaisa) / 1000).toFixed(3);
  const action =
    input.status === "CONFIRMED"
      ? "confirmed"
      : input.status === "REJECTED"
        ? "rejected"
        : "reversed";
  return {
    kind: "SECURITY",
    template: `billing.payment_${action}.v1`,
    to: input.to,
    subject: `Payment ${action} for ${input.organizationName}`,
    text: `A payment of OMR ${amountOmr} for ${input.organizationName} was ${action}.${input.detail ? ` ${input.detail}` : ""}`,
    html: emailShell(
      `Payment ${action}`,
      `<p style="line-height:1.6">A payment of <strong>OMR ${amountOmr}</strong> for <strong>${escapeHtml(input.organizationName)}</strong> was ${action}.</p>${input.detail ? `<p style="line-height:1.6">${escapeHtml(input.detail)}</p>` : ""}`,
    ),
    organizationId: input.organizationId,
    userId: input.userId,
    idempotencyKey: `billing:${input.paymentId}:${input.status.toLowerCase()}`,
  };
}

export function invitationEmail(input: {
  to: string;
  organizationName: string;
  organizationId: string;
  role: string;
  invitationId: string;
  invitationUrl: string;
}): MailDraft {
  const safeUrl = escapeHtml(input.invitationUrl);
  return {
    kind: "SECURITY",
    template: "organization.invitation.v1",
    to: input.to,
    subject: `You're invited to ${input.organizationName} on Aiwa Creators`,
    text: `You were invited to ${input.organizationName} with role ${input.role}. Accept the invitation: ${input.invitationUrl}`,
    html: emailShell(
      "Workspace invitation",
      `<p style="line-height:1.6">You were invited to <strong>${escapeHtml(input.organizationName)}</strong> with role <strong>${escapeHtml(input.role)}</strong>.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#171717;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a></p>`,
    ),
    organizationId: input.organizationId,
    sensitive: true,
    idempotencyKey: `invitation:${input.invitationId}`,
  };
}

export function generationFailedEmail(input: {
  to: string;
  userId: string;
  organizationId: string;
  generationJobId: string;
  message: string;
}): MailDraft {
  return {
    kind: "ROUTINE",
    template: "generation.failed.v1",
    to: input.to,
    subject: "Your Aiwa Creators generation could not be completed",
    text: `Your generation could not be completed. ${input.message}`,
    html: emailShell(
      "Generation not completed",
      `<p style="line-height:1.6">Your generation could not be completed.</p><p style="line-height:1.6">${escapeHtml(input.message)}</p>`,
    ),
    organizationId: input.organizationId,
    userId: input.userId,
    sensitive: false,
    idempotencyKey: `generation-failed:${input.generationJobId}`,
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
