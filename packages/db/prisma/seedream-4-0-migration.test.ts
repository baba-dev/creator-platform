import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const db = new PrismaClient();
const integrationDescribe =
  process.env.GENERATION_INTEGRATION_TEST === "true" ? describe : describe.skip;

const providerTable = "Seedream40MigrationProviderModelTest";
const priceTable = "Seedream40MigrationPriceTest";
const userTable = "Seedream40MigrationUserTest";

async function executeMigrationAgainstFixtures(): Promise<void> {
  const migrationPath = fileURLToPath(
    new URL(
      "./migrations/20261001020000_seedream_4_0_model/migration.sql",
      import.meta.url,
    ),
  );
  const migration = (await readFile(migrationPath, "utf8"))
    .replaceAll("`ProviderModel`", `\`${providerTable}\``)
    .replaceAll("`ModelPriceVersion`", `\`${priceTable}\``)
    .replaceAll("`User`", `\`${userTable}\``);

  for (const statement of migration
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
}

integrationDescribe("Seedream 4.0 migration", () => {
  afterAll(async () => {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${priceTable}\``);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${providerTable}\``);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${userTable}\``);
    await db.$disconnect();
  });

  it("preserves a legacy model id and seeds corrected capabilities and pricing", async () => {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${priceTable}\``);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${providerTable}\``);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${userTable}\``);

    await db.$executeRawUnsafe(`
      CREATE TABLE \`${userTable}\` (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        email VARCHAR(191) NOT NULL UNIQUE
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE \`${providerTable}\` (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        provider VARCHAR(32) NOT NULL,
        providerModelId VARCHAR(191) NOT NULL,
        mediaKind VARCHAR(32) NOT NULL,
        displayName VARCHAR(191) NOT NULL,
        description TEXT NOT NULL,
        capabilities JSON NOT NULL,
        negotiatedDiscountBps INT NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        createdAt DATETIME(3) NOT NULL,
        updatedAt DATETIME(3) NOT NULL,
        UNIQUE KEY provider_model (provider, providerModelId)
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE \`${priceTable}\` (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        providerModelId VARCHAR(191) NOT NULL,
        providerCostMicroUsd BIGINT NOT NULL,
        providerCostBasisNote VARCHAR(255) NULL,
        customerCredits BIGINT NOT NULL,
        fxBaisaNumerator BIGINT NOT NULL,
        fxBaisaDenominator BIGINT NOT NULL,
        targetMarginBps INT NOT NULL,
        pricingDimension VARCHAR(32) NOT NULL,
        unitQuantity INT NOT NULL,
        creditsPerBaisa BIGINT NOT NULL DEFAULT 1,
        effectiveFrom DATETIME(3) NOT NULL,
        effectiveTo DATETIME(3) NULL,
        createdById VARCHAR(191) NOT NULL,
        createdAt DATETIME(3) NOT NULL
      )
    `);

    await db.$executeRawUnsafe(
      `INSERT INTO \`${userTable}\` (id, email) VALUES (?, ?)`,
      "system-user",
      "system@aiwamediagroup.com",
    );
    await db.$executeRawUnsafe(
      `INSERT INTO \`${providerTable}\`
        (id, provider, providerModelId, mediaKind, displayName, description, capabilities, negotiatedDiscountBps, enabled, createdAt, updatedAt)
       VALUES (?, 'BYTEPLUS', 'seedream-4-0', 'IMAGE', 'Legacy Seedream 4.0', 'legacy', JSON_OBJECT(), 0, FALSE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      "legacy-seedream-40",
    );

    await executeMigrationAgainstFixtures();

    const models = await db.$queryRawUnsafe<
      Array<{
        id: string;
        providerModelId: string;
        enabled: number;
        negotiatedDiscountBps: number;
        supports1K: string;
      }>
    >(`
      SELECT
        id,
        providerModelId,
        enabled,
        negotiatedDiscountBps,
        JSON_UNQUOTE(JSON_EXTRACT(capabilities, '$."resolution:1K"')) AS supports1K
      FROM \`${providerTable}\`
      WHERE provider = 'BYTEPLUS'
        AND providerModelId IN ('seedream-4-0', 'seedream-4-0-250828')
    `);

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "legacy-seedream-40",
      providerModelId: "seedream-4-0-250828",
      negotiatedDiscountBps: 1000,
      supports1K: "true",
    });
    expect(Number(models[0]?.enabled)).toBe(0);

    const prices = await db.$queryRawUnsafe<
      Array<{
        providerModelId: string;
        providerCostMicroUsd: bigint;
        customerCredits: bigint;
        creditsPerBaisa: bigint;
        providerCostBasisNote: string;
      }>
    >(`
      SELECT
        providerModelId,
        providerCostMicroUsd,
        customerCredits,
        creditsPerBaisa,
        providerCostBasisNote
      FROM \`${priceTable}\`
      WHERE effectiveTo IS NULL
    `);

    expect(prices).toHaveLength(1);
    expect(prices[0]?.providerModelId).toBe("legacy-seedream-40");
    expect(BigInt(prices[0]!.providerCostMicroUsd)).toBe(27_000n);
    expect(BigInt(prices[0]!.customerCredits)).toBe(15n);
    expect(BigInt(prices[0]!.creditsPerBaisa)).toBe(1n);
    expect(prices[0]?.providerCostBasisNote).toContain("10% off");
  });
});
