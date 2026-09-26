/**
 * `composeApi`: the composition root's one primitive. A controller builds
 * its capability from area slices (each `satisfies Partial<Capability>`)
 * plus the service-owned members (authority twins, event hooks); this spreads
 * them into one object and refuses a key that two slices both define, so a
 * new verb can never silently shadow an old one.
 *
 *   const api: FormHostCapability = composeApi('form', [
 *     fields.api,
 *     values.api,
 *     { canFill: () => authority.can('doc.forms.fill'), onValueChanged: events.valueChanged.on },
 *   ]);
 */

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;

export function composeApi<const T extends readonly object[]>(
  capability: string,
  slices: T,
): UnionToIntersection<T[number]> {
  const seen = new Set<string>();
  const api: Record<string, unknown> = {};
  for (const slice of slices) {
    for (const key of Object.keys(slice)) {
      if (seen.has(key)) {
        throw new Error(`[${capability}] api member '${key}' is defined twice`);
      }
      seen.add(key);
      api[key] = (slice as Record<string, unknown>)[key];
    }
  }
  return api as UnionToIntersection<T[number]>;
}
