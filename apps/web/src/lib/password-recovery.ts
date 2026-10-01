export function validatePasswordReset(
  password: string,
  confirmPassword: string,
): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters long.";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

export function isPasswordResetTokenFailure(input: {
  status?: number | string | null;
  message?: string | null;
}): boolean {
  const normalized = (input.message ?? "").toLowerCase();
  const numericStatus =
    typeof input.status === "number" ? input.status : Number(input.status);
  return (
    numericStatus === 400 ||
    normalized.includes("token") ||
    normalized.includes("expired") ||
    normalized.includes("invalid")
  );
}
