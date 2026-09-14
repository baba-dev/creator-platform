import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error(
      "Usage: pnpm --filter @aiwa/db platform:promote-owner -- owner@example.com",
    );
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    throw new Error(
      "No account exists for that email. Ask the owner to sign up first.",
    );
  }

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { platformRole: "PLATFORM_OWNER" },
    }),
    db.auditEvent.create({
      data: {
        action: "platform.owner_promoted",
        targetType: "User",
        targetId: user.id,
        metadata: { source: "ops_cli" },
      },
    }),
  ]);

  console.info("Platform owner access granted.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
