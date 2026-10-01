import { describe, expect, it } from "vitest";

import { cuidSchema, userRecordIdSchema } from "../src/index";

describe("userRecordIdSchema", () => {
  it("accepts mixed-case Better Auth user identifiers", () => {
    expect(
      userRecordIdSchema.safeParse("AbCdEf0123456789GhIjKlMnOpQrStUv").success,
    ).toBe(true);
  });

  it("continues to accept legacy Prisma CUID-shaped user identifiers", () => {
    expect(
      userRecordIdSchema.safeParse("cm123456789012345678901234").success,
    ).toBe(true);
  });

  it("rejects path-unsafe identifiers", () => {
    expect(
      userRecordIdSchema.safeParse("../../users/other").success,
    ).toBe(false);
    expect(
      userRecordIdSchema.safeParse("user id with spaces 1234567890").success,
    ).toBe(false);
  });

  it("keeps Prisma CUID validation strict for non-user records", () => {
    expect(
      cuidSchema.safeParse("AbCdEf0123456789GhIjKlMnOpQrStUv").success,
    ).toBe(false);
  });
});
