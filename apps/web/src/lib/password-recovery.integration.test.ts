import { randomUUID } from "node:crypto";

import { db } from "@aiwa/db";
import { afterAll, describe, expect, it } from "vitest";

import {
  PASSWORD_RESET_RESPONSE_FLOOR_MS,
  POST as passwordResetPost,
} from "@/app/api/auth/[...all]/route";
import { auth } from "@/lib/auth";

const integration =
  process.env.DATABASE_URL && process.env.GENERATION_INTEGRATION_TEST === "true"
    ? describe.sequential
    : describe.skip;

function resetRequest(email: string) {
  return new Request("http://localhost:3000/api/auth/request-password-reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      email,
      redirectTo: "http://localhost:3000/reset-password",
    }),
  });
}

function resetTokenFromMail(textBody: string): string {
  const match = textBody.match(/https?:\/\/[^\s]+/u);
  if (!match) throw new Error("Password-reset mail does not contain a URL.");

  const url = new URL(match[0]);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const parts = url.pathname.split("/").filter(Boolean);
  const resetIndex = parts.lastIndexOf("reset-password");
  const pathToken = resetIndex >= 0 ? parts[resetIndex + 1] : undefined;
  if (!pathToken) {
    throw new Error("Password-reset mail URL does not contain a token.");
  }
  return decodeURIComponent(pathToken);
}

integration("password recovery integration", () => {
  const suffix = randomUUID();
  const email = `pw-reset-${suffix}@example.com`;
  const unknownEmail = `pw-reset-unknown-${suffix}@example.com`;
  const initialPassword = "Initial-Password-123!";
  const newPassword = "Updated-Password-456!";

  afterAll(async () => {
    await db.mailMessage.deleteMany({
      where: { recipient: { in: [email, unknownEmail] } },
    });
    await db.user.deleteMany({ where: { email } });
  });

  it(
    "queues reset mail durably, resets the password, revokes sessions, and rejects token reuse",
    async () => {
      await auth.api.signUpEmail({
        body: {
          name: "Password Recovery Integration",
          email,
          password: initialPassword,
        },
      });

      const user = await db.user.update({
        where: { email },
        data: { emailVerified: true },
        select: { id: true },
      });

      await auth.api.signInEmail({
        body: {
          email,
          password: initialPassword,
          rememberMe: true,
        },
      });

      expect(
        await db.session.count({ where: { userId: user.id } }),
      ).toBeGreaterThan(0);

      const startedAt = performance.now();
      const response = await passwordResetPost(resetRequest(email));
      const elapsedMs = performance.now() - startedAt;

      expect(response.status).toBe(200);
      expect(elapsedMs).toBeGreaterThanOrEqual(
        PASSWORD_RESET_RESPONSE_FLOOR_MS - 20,
      );

      const resetMail = await db.mailMessage.findFirst({
        where: {
          recipient: email,
          template: "auth.password_reset.v1",
        },
        orderBy: { createdAt: "desc" },
      });

      expect(resetMail).not.toBeNull();
      expect(resetMail?.status).toBe("PENDING");

      const token = resetTokenFromMail(resetMail!.textBody);

      await expect(
        auth.api.resetPassword({
          body: { newPassword, token },
        }),
      ).resolves.toBeDefined();

      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

      await expect(
        auth.api.signInEmail({
          body: {
            email,
            password: newPassword,
            rememberMe: true,
          },
        }),
      ).resolves.toBeDefined();

      await expect(
        auth.api.signInEmail({
          body: {
            email,
            password: initialPassword,
            rememberMe: true,
          },
        }),
      ).rejects.toBeDefined();

      await expect(
        auth.api.resetPassword({
          body: { newPassword: "Another-Password-789!", token },
        }),
      ).rejects.toBeDefined();
    },
  );

  it("rejects an expired reset token", async () => {
    const requestedAt = new Date();
    const response = await passwordResetPost(resetRequest(email));
    expect(response.status).toBe(200);

    const resetMail = await db.mailMessage.findFirstOrThrow({
      where: {
        recipient: email,
        template: "auth.password_reset.v1",
        createdAt: { gte: requestedAt },
      },
      orderBy: { createdAt: "desc" },
    });
    const token = resetTokenFromMail(resetMail.textBody);

    const expired = await db.verification.updateMany({
      where: { createdAt: { gte: requestedAt } },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(expired.count).toBeGreaterThan(0);

    await expect(
      auth.api.resetPassword({
        body: { newPassword: "Expired-Password-000!", token },
      }),
    ).rejects.toBeDefined();
  });

  it(
    "returns the same public success envelope for an unknown account without queueing mail",
    async () => {
      const startedAt = performance.now();
      const response = await passwordResetPost(resetRequest(unknownEmail));
      const elapsedMs = performance.now() - startedAt;

      expect(response.status).toBe(200);
      expect(elapsedMs).toBeGreaterThanOrEqual(
        PASSWORD_RESET_RESPONSE_FLOOR_MS - 20,
      );
      expect(
        await db.mailMessage.count({
          where: {
            recipient: unknownEmail,
            template: "auth.password_reset.v1",
          },
        }),
      ).toBe(0);
    },
  );
});
