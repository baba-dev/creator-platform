import { PrismaClient, type Prisma } from "@prisma/client";
import { curatedGenerationTemplates } from "./templates";

type TemplateCatalogDb = Pick<PrismaClient, "generationTemplate">;

/**
 * Ensures the built-in MVP template catalog exists without overwriting
 * administrator-managed edits or lifecycle state on subsequent deployments.
 */
export async function seedTemplateCatalog(
  db: TemplateCatalogDb,
): Promise<number> {
  let created = 0;

  for (const template of curatedGenerationTemplates) {
    const existing = await db.generationTemplate.findUnique({
      where: { slug: template.slug },
      select: { id: true },
    });

    if (existing) continue;

    await db.generationTemplate.create({
      data: {
        ...template,
        variables: template.variables as Prisma.InputJsonValue,
        defaultInput: template.defaultInput as Prisma.InputJsonValue,
        preferredModelId: template.preferredModelId ?? null,
        featured: template.featured ?? false,
        status: "PUBLISHED",
      },
    });
    created += 1;
  }

  return created;
}
