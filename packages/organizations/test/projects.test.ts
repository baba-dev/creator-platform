import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  $queryRaw: vi.fn(),
  organization: {
    findUnique: vi.fn(),
  },
  project: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
};

vi.mock("@aiwa/db", () => ({
  db: {
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  },
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: "Serializable",
    },
  },
}));

import {
  PermissionDeniedError,
  ProjectArchivedError,
  ProjectNotFoundError,
  assertAssignableProject,
  createProject,
  setProjectArchived,
  updateProject,
} from "../src/index";

const memberActor = {
  userId: "user-1",
  platformRole: "USER" as const,
  organizationId: "org-1",
  organizationRole: "ORGANIZATION_MEMBER" as const,
};

describe("project workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "org-1" }]);
    tx.organization.findUnique.mockResolvedValue({
      id: "org-1",
      status: "ACTIVE",
      ownerUserId: "owner-1",
    });
    tx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  it("creates a normalized project and records an audit event", async () => {
    tx.project.create.mockImplementation(async ({ data }) => ({
      id: "project-1",
      ...data,
      archivedAt: null,
      createdAt: new Date("2026-09-24T00:00:00Z"),
      updatedAt: new Date("2026-09-24T00:00:00Z"),
    }));

    const project = await createProject({
      actor: memberActor,
      organizationId: "org-1",
      name: "  Ramadan   launch  ",
      description: "  Social campaign  ",
    });

    expect(project).toMatchObject({
      id: "project-1",
      name: "Ramadan launch",
      description: "Social campaign",
    });
    expect(tx.project.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        name: "Ramadan launch",
        description: "Social campaign",
      },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "user-1",
        organizationId: "org-1",
        action: "project.created",
        targetType: "Project",
        targetId: "project-1",
      }),
    });
  });

  it("prevents viewers from mutating projects", async () => {
    await expect(
      createProject({
        actor: {
          ...memberActor,
          organizationRole: "ORGANIZATION_VIEWER",
        },
        organizationId: "org-1",
        name: "Blocked",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(tx.project.create).not.toHaveBeenCalled();
  });

  it("updates an active project but refuses to edit an archived project", async () => {
    tx.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      name: "Old name",
      description: null,
      archivedAt: null,
    });
    tx.project.update.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      name: "New name",
      description: "Updated",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      updateProject({
        actor: memberActor,
        organizationId: "org-1",
        projectId: "project-1",
        name: " New name ",
        description: " Updated ",
      }),
    ).resolves.toMatchObject({ name: "New name", description: "Updated" });

    tx.project.findFirst.mockResolvedValueOnce({
      id: "project-2",
      organizationId: "org-1",
      name: "Archived",
      description: null,
      archivedAt: new Date(),
    });

    await expect(
      updateProject({
        actor: memberActor,
        organizationId: "org-1",
        projectId: "project-2",
        name: "Cannot edit",
      }),
    ).rejects.toBeInstanceOf(ProjectArchivedError);
  });

  it("archives and restores without deleting historical relations", async () => {
    const existing = {
      id: "project-1",
      organizationId: "org-1",
      name: "Campaign",
      description: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.project.findFirst.mockResolvedValue(existing);
    tx.project.update.mockImplementation(async ({ data }) => ({
      ...existing,
      archivedAt: data.archivedAt,
    }));

    const archived = await setProjectArchived({
      actor: memberActor,
      organizationId: "org-1",
      projectId: "project-1",
      archived: true,
    });

    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { archivedAt: expect.any(Date) },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "project.archived" }),
    });
  });

  it("only allows assignment to an active project in the same organization", async () => {
    tx.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      archivedAt: null,
    });
    await expect(
      assertAssignableProject(tx as never, "org-1", "project-1"),
    ).resolves.toMatchObject({ id: "project-1" });

    tx.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      archivedAt: new Date(),
    });
    await expect(
      assertAssignableProject(tx as never, "org-1", "project-1"),
    ).rejects.toBeInstanceOf(ProjectArchivedError);

    tx.project.findFirst.mockResolvedValueOnce(null);
    await expect(
      assertAssignableProject(tx as never, "org-1", "other-org-project"),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
