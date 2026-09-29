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
  REDIS_URL: "redis://:test-secret@127.0.0.1:6379/0",
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

  it("requires both routine credentials for a configured staging SMTP host", () => {
    const staging = {
      ...productionBase,
      APP_ENV: "staging",
      SMTP_HOST: "mail.aiwamediagroup.com",
    };
    expect(() =>
      parseServerEnv({
        ...staging,
        ROUTINE_USER: "creator-tool@aiwamediagroup.com",
      }),
    ).toThrow(/ROUTINE_USER_PASSWORD/);
    expect(() =>
      parseServerEnv({
        ...staging,
        SMTP_USER: "security@aiwamediagroup.com",
        SMTP_PASSWORD: "security-secret",
      }),
    ).toThrow(/ROUTINE_USER/);
    const env = parseServerEnv({
      ...staging,
      ROUTINE_USER: "creator-tool@aiwamediagroup.com",
      ROUTINE_USER_PASSWORD: "routine-secret",
    });
    expect(env.ROUTINE_USER).toBe("creator-tool@aiwamediagroup.com");
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

  describe("production Redis and APP_URL topology rules", () => {
    it("permits unauthenticated Redis on loopback (127.0.0.1) in production", () => {
      const env = parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        REDIS_URL: "redis://127.0.0.1:6379/0",
      });
      expect(env.REDIS_URL).toBe("redis://127.0.0.1:6379/0");
    });

    it("permits unauthenticated Redis on localhost and ::1 in production", () => {
      const envLocalhost = parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        REDIS_URL: "redis://localhost:6379/0",
      });
      expect(envLocalhost.REDIS_URL).toBe("redis://localhost:6379/0");

      const envIpv6 = parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        REDIS_URL: "redis://[::1]:6379/0",
      });
      expect(envIpv6.REDIS_URL).toBe("redis://[::1]:6379/0");
    });

    it("requires authentication for non-loopback Redis in production", () => {
      expect(() =>
        parseServerEnv({
          ...productionBase,
          MAIL_ENABLED: "false",
          REDIS_URL: "redis://redis.internal:6379/0",
        }),
      ).toThrow(/authentication is required for non-loopback Redis/);

      expect(() =>
        parseServerEnv({
          ...productionBase,
          MAIL_ENABLED: "false",
          REDIS_URL: "redis://10.0.0.5:6379/0",
        }),
      ).toThrow(/authentication is required for non-loopback Redis/);
    });

    it("permits authenticated remote Redis and rediss:// in production", () => {
      const env = parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        REDIS_URL: "redis://:secret@redis.internal:6379/0",
      });
      expect(env.REDIS_URL).toBe("redis://:secret@redis.internal:6379/0");

      const tlsEnv = parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        REDIS_URL: "rediss://:secret@redis.internal:6379/0",
      });
      expect(tlsEnv.REDIS_URL).toBe("rediss://:secret@redis.internal:6379/0");
    });

    it("rejects non-redis protocol in REDIS_URL", () => {
      expect(() =>
        parseServerEnv({
          ...productionBase,
          MAIL_ENABLED: "false",
          REDIS_URL: "http://127.0.0.1:6379/0",
        }),
      ).toThrow(/must use redis:\/\/ or rediss:\/\/ protocol/);
    });

    it("permits valid HTTPS public APP_URL in production", () => {
      const env = parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        APP_URL: "https://creator.aiwamediagroup.com",
      });
      expect(env.APP_URL).toBe("https://creator.aiwamediagroup.com");
    });

    it("rejects insecure http:// public APP_URL in production", () => {
      expect(() =>
        parseServerEnv({
          ...productionBase,
          MAIL_ENABLED: "false",
          APP_URL: "http://creator.aiwamediagroup.com",
        }),
      ).toThrow(/HTTPS and non-localhost URL are required/);
    });

    it("rejects localhost APP_URL even with https in production", () => {
      expect(() =>
        parseServerEnv({
          ...productionBase,
          MAIL_ENABLED: "false",
          APP_URL: "https://localhost:3000",
        }),
      ).toThrow(/HTTPS and non-localhost URL are required/);
    });
  });
  it("bounds generation worker concurrency", () => {
    const valid = parseServerEnv({
      ...productionBase,
      MAIL_ENABLED: "false",
      GENERATION_WORKER_CONCURRENCY: "10",
    });
    expect(valid.GENERATION_WORKER_CONCURRENCY).toBe(10);

    expect(() =>
      parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        GENERATION_WORKER_CONCURRENCY: "0",
      }),
    ).toThrow(/GENERATION_WORKER_CONCURRENCY/);

    expect(() =>
      parseServerEnv({
        ...productionBase,
        MAIL_ENABLED: "false",
        GENERATION_WORKER_CONCURRENCY: "11",
      }),
    ).toThrow(/GENERATION_WORKER_CONCURRENCY/);
  });
});
