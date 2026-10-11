// Secret Manager and deployment settings do not interpret .env quotation marks.
export function normalizeEnvironmentValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length >= 2 && (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )) return trimmed.slice(1, -1).trim() || undefined;
  return trimmed;
}
