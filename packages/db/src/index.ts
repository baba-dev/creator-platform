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
  PrismaClient,
  PaymentStatus,
  PaymentMethod,
  LedgerEntryType,
  GenerationJobStatus,
  ReasoningJobStatus,
  MembershipRole,
  PlatformRole,
  MediaKind,
  ModelProvider,
  GenerationTemplateStatus,
  AssetStorageProvider,
  AssetStatus,
  AssetMediaKind,
  AssetSourceType,
} from "@prisma/client";

export type {
  AuditEvent,
  GenerationJob,
  GenerationTemplate,
  TemplateFavorite,
  ReasoningJob,
  LedgerEntry,
  ManualPayment,
  Membership,
  ModelPriceVersion,
  Organization,
  OrganizationInvitation,
  Project,
  ProviderModel,
  TwoFactor,
  User,
  Wallet,
  ExternalStorageConfig,
} from "@prisma/client";
