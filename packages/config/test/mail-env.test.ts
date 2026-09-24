import { describe, expect, it } from "vitest";
import { parseServerEnv } from "../src/index";

const productionBase = {
  NODE_ENV: "production",
  APP_ENV: "production",
  APP_VERSION: "test",
  APP_URL: "https://creator.aiwamediagroup.com",
  AUTH_SECRET: "test-auth-secret-that-is-at-least-32-characters",
  SIGNUPS_ENABLED: "true",
  DATABASE_URL: "mysql://creator:test@127.0.0.1:3306/creator_platform",
  REDIS_URL: "redis://127.0.0.1:6379/0",
};

describe("production mail configuration", () => {
  it("fails closed when mail is enabled without explicit SMTP credentials", () => {
    expect(() =>
      parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "true",
      }),
    ).toThrow(/SMTP_HOST/);
  });

  it("accepts explicitly disabled mail without SMTP credentials", () => {
    const env = parseServerEnv({
      ...productionBase,
      MAIL_ENABLED: "false",
    });
    expect(env.MAIL_ENABLED).toBe(false);
  });

  it("requires implicit TLS port 465 in production", () => {
    expect(() =>
      parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "true",
        SMTP_HOST: "mail.aiwamediagroup.com",
        SMTP_PORT: "587",
        SMTP_USER: "security@aiwamediagroup.com",
        SMTP_PASSWORD: "secret",
        MAIL_SECURITY_FROM_ADDRESS: "security@aiwamediagroup.com",
        MAIL_ROUTINE_FROM_ADDRESS: "creator-tool@aiwamediagroup.com",
      }),
    ).toThrow(/SMTP_PORT/);
  });
});
