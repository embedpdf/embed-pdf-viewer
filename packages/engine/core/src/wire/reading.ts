import { z } from 'zod';

/**
 * How a client reads a set a response carries: an enum, a literal or a
 * union's kinds (docs/conventions/api-evolution.md, "Reading tolerantly").
 * A closed set gains no value within a major; an open one names the value a
 * client reads one it doesn't know as.
 */
export type SetReading = { readonly closed: true } | { readonly unknownAs: string };

/**
 * Where a set keeps its reading: on its zod definition, so every copy of this
 * module (and every copy zod makes of the definition, like `.describe()`'s)
 * sees it.
 */
const READING = Symbol.for('@embedpdf/engine-core/reading');

type MarkedDef = z.ZodTypeDef & { [READING]?: SetReading };

function mark(schema: z.ZodTypeAny, reading: SetReading): void {
  (schema._def as MarkedDef)[READING] = reading;
}

/** How a set a response carries is read; `undefined` when it says neither. */
export function readingOf(schema: z.ZodTypeAny): SetReading | undefined {
  return (schema._def as MarkedDef)[READING];
}

/** Marks a set a response carries as closed: adding a value to it is a breaking change. */
export function closed<T extends z.ZodTypeAny>(set: T): T {
  mark(set, { closed: true });
  return set;
}

/**
 * An enum a response carries that can gain values: a value this client
 * doesn't know reads as `unknownAs`. Only responses are read this way; a
 * request is parsed with `set` itself, which refuses a value it doesn't know.
 */
export function readsUnknownAs<T extends [string, ...string[]]>(
  set: z.ZodEnum<T>,
  unknownAs: T[number],
): z.ZodType<T[number]> {
  const known = new Set<string>(set.options);
  const reading = z.preprocess(
    (value) => (typeof value === 'string' && !known.has(value) ? unknownAs : value),
    set,
  ) as z.ZodType<T[number]>;
  mark(reading, { unknownAs });
  return reading;
}

/**
 * A union a response carries with a catch-all kind: an object whose
 * discriminator this client doesn't know reads as `unknownAs`, and
 * `asCatchAll` adds what that kind has beyond the object's own fields. A kind
 * the client knows is read as that kind, so a malformed one still fails: the
 * catch-all is for kinds a newer server adds, not for broken data.
 */
export function withCatchAll<T>(
  union: z.ZodType<T>,
  unknownAs: string,
  asCatchAll: (value: Record<string, unknown>) => Record<string, unknown> = (value) => value,
): z.ZodType<T> {
  const { discriminator, optionsMap } = (
    union as unknown as z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>
  )._def;
  const reading = z.preprocess((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const kind = (value as Record<string, unknown>)[discriminator];
    if (typeof kind !== 'string' || optionsMap.has(kind)) return value;
    return asCatchAll({ ...value, [discriminator]: unknownAs });
  }, union) as z.ZodType<T>;
  mark(reading, { unknownAs });
  return reading;
}
