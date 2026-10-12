/**
 * Only parse Better Auth's TOTP provisioning payload. Never persist, log, or
 * send the URI/key to a QR-image API: the QR is rendered in the user's browser.
 */
export type TotpProvisioning = {
  uri: string;
  issuer: string;
  account: string;
  secret: string;
  algorithm: "SHA1";
  digits: 6;
  period: 30;
};

export function parseTotpProvisioning(
  value: string,
  expectedAccount: string,
): TotpProvisioning | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "otpauth:" || url.hostname !== "totp") return null;
    if (
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      url.searchParams.has("counter")
    )
      return null;
    const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const colon = label.indexOf(":");
    if (colon < 1) return null;
    const issuer = label.slice(0, colon);
    const account = label.slice(colon + 1);
    const queryIssuer = url.searchParams.get("issuer");
    const secret = url.searchParams.get("secret") ?? "";
    if (
      issuer !== "Aiwa Creators" ||
      queryIssuer !== issuer ||
      account !== expectedAccount ||
      !/^[A-Z2-7]{16,128}=*$/i.test(secret) ||
      (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase() !== "SHA1" ||
      (url.searchParams.get("digits") ?? "6") !== "6" ||
      (url.searchParams.get("period") ?? "30") !== "30"
    )
      return null;
    return {
      uri: value,
      issuer,
      account,
      secret: secret.toUpperCase(),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    };
  } catch {
    return null;
  }
}
