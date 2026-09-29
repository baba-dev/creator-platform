import { PrismaClient } from "@prisma/client";
import { seedTemplateCatalog } from "./template-catalog";

const db = new PrismaClient();

async function main(): Promise<void> {
  const created = await seedTemplateCatalog(db);
  console.info(
    created > 0
      ? `Created ${created} missing generation templates.`
      : "Generation template catalog is already present.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
