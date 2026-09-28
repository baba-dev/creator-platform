CREATE INDEX `GenerationJob_organizationId_createdAt_id_idx` ON `GenerationJob`(`organizationId`, `createdAt`, `id`);
CREATE INDEX `GenerationJob_organizationId_createdById_createdAt_id_idx` ON `GenerationJob`(`organizationId`, `createdById`, `createdAt`, `id`);
