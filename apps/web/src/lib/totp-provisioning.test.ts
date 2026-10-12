import { describe, expect, it } from "vitest";
import { parseTotpProvisioning } from "./totp-provisioning";

const account = "member@example.test";
const secret = "JBSWY3DPEHPK3PXP"; // Test fixture, not an actual user key.
const uri = `otpauth://totp/Aiwa%20Creators:member%40example.test?secret=${secret}&issuer=Aiwa+Creators&digits=6&period=30`;

describe("TOTP provisioning URI", () => {
  it("extracts the manual setup fields without changing the QR payload", () => {
    expect(parseTotpProvisioning(uri, account)).toEqual({
      uri, issuer: "Aiwa Creators", account, secret, algorithm: "SHA1", digits: 6, period: 30,
    });
  });

  it.each([
    ["untrusted scheme", uri.replace("otpauth:", "https:")],
    ["wrong factor", uri.replace("//totp/", "//hotp/")],
    ["wrong account", uri.replace("member%40example.test", "attacker%40example.test")],
    ["wrong issuer", uri.replace("issuer=Aiwa+Creators", "issuer=Other")],
    ["missing secret", uri.replace(secret, "")],
    ["unsupported algorithm", uri + "&algorithm=SHA256"],
    ["unsupported interval", uri.replace("period=30", "period=60")],
    ["unsupported digits", uri.replace("digits=6", "digits=8")],
    ["counter mode", uri + "&counter=1"],
  ])("rejects %s", (_label, bad) => {
    expect(parseTotpProvisioning(bad, account)).toBeNull();
  });

  it("never accepts provisioning for a different signed-in identity", () => {
    expect(parseTotpProvisioning(uri, "other@example.test")).toBeNull();
  });
});
