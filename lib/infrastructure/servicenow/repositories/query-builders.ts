/**
 * Query builder utilities for ServiceNow repositories
 */

/**
 * Build a flexible LIKE query that tolerates punctuation, spacing, and token variations.
 * Returns a clause ready to be inserted into a ServiceNow encoded query.
 */
export function buildFlexibleLikeQuery(fieldPath: string, rawValue?: string | null): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const variations = new Set<string>();
  variations.add(`${fieldPath}LIKE${trimmed}`);

  const normalized = trimmed
    .replace(/[\-_/\\.+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized && normalized !== trimmed) {
    variations.add(`${fieldPath}LIKE${normalized}`);
  }

  const collapsed = normalized.replace(/\s+/g, "");
  if (collapsed && collapsed !== trimmed && collapsed !== normalized) {
    variations.add(`${fieldPath}LIKE${collapsed}`);
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    const andClause = tokens.map((token) => `${fieldPath}LIKE${token}`).join("^");
    variations.add(`(${andClause})`);
  }

  const clauses = Array.from(variations);
  if (clauses.length === 0) {
    return undefined;
  }
  if (clauses.length === 1) {
    return clauses[0];
  }

  return `(${clauses.join("^OR")})`;
}
