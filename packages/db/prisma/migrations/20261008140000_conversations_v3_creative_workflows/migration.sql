-- Conversation v3 / Orchestration durable workflow models
CREATE TABLE `CreativeWorkflow` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `requestKey` VARCHAR(128) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    `metadata` JSON NULL,
    `cancelledAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `CreativeWorkflow_threadId_requestKey_key`(`threadId`, `requestKey`),
    INDEX `CreativeWorkflow_organizationId_status_createdAt_idx`(`organizationId`, `status`, `createdAt`),
    INDEX `CreativeWorkflow_threadId_createdAt_idx`(`threadId`, `createdAt`),
    CONSTRAINT `CreativeWorkflow_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CreativeWorkflowStep` (
    `id` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `task` VARCHAR(64) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    `modelId` VARCHAR(128) NULL,
    `payload` JSON NOT NULL,
    `quote` JSON NULL,
    `jobId` VARCHAR(191) NULL,
    `outputs` JSON NULL,
    `error` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `CreativeWorkflowStep_workflowId_position_key`(`workflowId`, `position`),
    INDEX `CreativeWorkflowStep_workflowId_status_idx`(`workflowId`, `status`),
    INDEX `CreativeWorkflowStep_jobId_idx`(`jobId`),
    CONSTRAINT `CreativeWorkflowStep_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `CreativeWorkflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CreativeWorkflowDependency` (
    `id` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NOT NULL,
    `sourceStepId` VARCHAR(191) NOT NULL,
    `outputIndex` INTEGER NOT NULL DEFAULT 0,
    `role` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `CreativeWorkflowDependency_stepId_sourceStepId_outputIndex_key`(`stepId`, `sourceStepId`, `outputIndex`),
    INDEX `CreativeWorkflowDependency_sourceStepId_idx`(`sourceStepId`),
    CONSTRAINT `CreativeWorkflowDependency_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `CreativeWorkflowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `CreativeWorkflowDependency_sourceStepId_fkey` FOREIGN KEY (`sourceStepId`) REFERENCES `CreativeWorkflowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CreativeWorkflowEvent` (
    `id` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NULL,
    `type` VARCHAR(64) NOT NULL,
    `status` VARCHAR(32) NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `CreativeWorkflowEvent_workflowId_createdAt_idx`(`workflowId`, `createdAt`),
    INDEX `CreativeWorkflowEvent_stepId_createdAt_idx`(`stepId`, `createdAt`),
    CONSTRAINT `CreativeWorkflowEvent_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `CreativeWorkflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `CreativeWorkflowEvent_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `CreativeWorkflowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
