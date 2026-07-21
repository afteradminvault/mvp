/**
 * PostgREST represents `bytea` columns as hex strings prefixed with `\x`
 * (Postgres's own default `bytea_output = hex`), both reading and writing.
 * The domain layer works in plain hex (no prefix, see src/crypto/encoding.ts)
 * — these helpers are the only place that prefix should ever be handled.
 */

export function toByteaColumn(hex: string): string {
  return `\\x${hex}`;
}

export function fromByteaColumn(value: string | null): string | null {
  if (value === null) return null;
  return value.startsWith("\\x") ? value.slice(2) : value;
}
