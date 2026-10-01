import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const db = new PrismaClient();
const integrationDescribe =
  process.env.GENERATION_INTEGRATION_TEST === "true" ? describe : describe.skip;

const providerTable = "Seedream5ProMigrationProviderModelTest";
const priceTable = "Seedream5ProMigrationPriceTest";
const userTable = "Seedream5ProMigrationUserTest";

async function executeMigrationAgainstFixtures(): Promise<void> {
  const migrationPath = fileURLToPath(
    new URL(
      "./migrations/20261001040000_seedream_5_pro_model/migration.sql",
      import.meta.url,
    ),
  );
  const migration = (await readFile(migrationPath, "utf8"))
    .replaceAll("`ProviderModel`", `\`${providerTable}\``)
    .replaceAll("`ModelPriceVersion`", `\`${priceTable}\``)
    .replaceAll("`User`", `\`${userTable}\``)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  for (const statement of migration
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
}

integrationDescribe("Seedream 5.0 Pro migration", () => {
  afterAll(async () => {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${priceTable}\``);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${providerTable}\``);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${userTable}\``);
    await db.$disconnect();
  });

  it("preserves a legacy primary key and enabled state while correcting the contract", async () => {
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
       VALUES (?, 'BYTEPLUS', 'seedream-5-0-pro', 'IMAGE', 'Legacy Pro', 'legacy', JSON_OBJECT(), 0, FALSE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      "legacy-seedream-5-pro",
    );

    await executeMigrationAgainstFixtures();

    const models = await db.$queryRawUnsafe<
      Array<{
        id: string;
        providerModelId: string;
        enabled: number;
        negotiatedDiscountBps: number;
        supports15K: string;
        supports4K: string | null;
        sequentialImages: string;
        maxGeneratedImages: string;
      }>
    >(`
      SELECT
        id,
        providerModelId,
        enabled,
        negotiatedDiscountBps,
        JSON_UNQUOTE(JSON_EXTRACT(capabilities, '$."resolution:1.5K"')) AS supports15K,
        JSON_UNQUOTE(JSON_EXTRACT(capabilities, '$."resolution:4K"')) AS supports4K,
        JSON_UNQUOTE(JSON_EXTRACT(capabilities, '$.sequentialImages')) AS sequentialImages,
        JSON_UNQUOTE(JSON_EXTRACT(capabilities, '$.maxGeneratedImages')) AS maxGeneratedImages
      FROM \`${providerTable}\`
      WHERE provider = 'BYTEPLUS'
        AND providerModelId IN ('seedream-5-0-pro', 'dola-seedream-5-0-pro-260628')
    `);

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "legacy-seedream-5-pro",
      providerModelId: "dola-seedream-5-0-pro-260628",
      negotiatedDiscountBps: 1000,
      supports15K: "true",
      supports4K: null,
      sequentialImages: "false",
      maxGeneratedImages: "1",
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
    expect(prices[0]?.providerModelId).toBe("legacy-seedream-5-pro");
    expect(BigInt(prices[0]!.providerCostMicroUsd)).toBe(40_500n);
    expect(BigInt(prices[0]!.customerCredits)).toBe(22n);
    expect(BigInt(prices[0]!.creditsPerBaisa)).toBe(1n);
    expect(prices[0]?.providerCostBasisNote).toContain("10% discount");
  });
});
