/**
 * `path` with the object numbers a create names, in its query string: one
 * (`objectNumber=42`) or a comma list (`objectNumbers=42,43`). The body
 * stays the data. Names whose value is absent are left out.
 */
export function withObjectNumbers(
  path: string,
  numbers: Readonly<Record<string, number | readonly number[] | undefined>>,
): string {
  const query = Object.entries(numbers)
    .filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0))
    .map(([name, value]) => `${name}=${Array.isArray(value) ? value.join(',') : String(value)}`);
  if (query.length === 0) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${query.join('&')}`;
}
