/**
 * Utility helpers for detecting Mobiz service-desk staff by email domain.
 */

const DEFAULT_DOMAIN = "mobizinc.com";

/**
 * Returns the list of allowed Mobiz email domains (lower-cased).
 * Controlled via MOBIZ_SERVICE_DESK_DOMAINS env variable.
 */
export function getAllowedMobizDomains(): string[] {
  const raw = process.env.MOBIZ_SERVICE_DESK_DOMAINS;
  if (!raw) {
    return [DEFAULT_DOMAIN];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks whether the provided email belongs to an allowed Mobiz domain.
 */
export function isMobizEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const allowed = getAllowedMobizDomains();
  const lower = email.toLowerCase();
  return allowed.some((domain) => lower.endsWith(`@${domain}`));
}
