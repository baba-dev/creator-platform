/** Registering a new user must respect the platform-wide signup gate. */
export function socialSignUpDisabled(signupsEnabled: boolean): boolean {
  return !signupsEnabled;
}
