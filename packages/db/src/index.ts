import { PrismaClient } from "@prisma/client";

const prismaGlobal = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  prismaGlobal.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.prisma = db;
}

export {
  Prisma,
  PaymentStatus,
  PaymentMethod,
  LedgerEntryType,
  GenerationJobStatus,
  MembershipRole,
  PlatformRole,
} from "@prisma/client";

export type {
  AuditEvent,
  GenerationJob,
  LedgerEntry,
  ManualPayment,
  Membership,
  ModelPriceVersion,
  Organization,
  OrganizationInvitation,
  Project,
  ProviderModel,
  User,
  Wallet,
} from "@prisma/client";
