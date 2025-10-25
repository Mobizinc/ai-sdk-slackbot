import { config } from "../config";
/**
 * Utility helpers for detecting Mobiz service-desk staff by email domain.
 */

const DEFAULT_DOMAIN = "mobizinc.com";

/**
 * Returns the list of allowed Mobiz email domains (lower-cased).
 * Controlled via MOBIZ_SERVICE_DESK_DOMAINS env variable.
 */
export function getAllowedMobizDomains(): string[] {
  const raw = config.mobizServiceDeskDomains || process.env.MOBIZ_SERVICE_DESK_DOMAINS;
  if (!raw) {
    return [DEFAULT_DOMAIN];
  }

  const domains = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return domains.length > 0 ? domains : [DEFAULT_DOMAIN];
}

/**
 * Checks whether the provided email belongs to an allowed Mobiz domain.
 */
export function isMobizEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("@");
  if (parts.length !== 2) {
    return false;
  }

  const [userPart, domainPart] = parts;
  if (!userPart || !domainPart) {
    return false;
  }

  const allowed = getAllowedMobizDomains();
  return allowed.some((domain) => {
    if (domainPart === domain) {
      return true;
    }
    return domainPart.endsWith(`.${domain}`);
  });
}
