import * as z from '../zod';

import { readingOf } from '../wire/reading';

/** The field {@link withUnknownFields} adds: one a newer server could send. */
export const UNKNOWN_FIELD = 'fieldFromANewerServer';

const UNKNOWN_VALUE = { nested: { values: [1, 'two', null] } };

/** Every kind of schema zod makes, told apart by its definition's `type`. */
type Def = z.core.$ZodTypes['_zod']['def'];
type UnionDef = Extract<Def, { type: 'union' }>;
type DiscriminatedUnionDef = z.core.$ZodDiscriminatedUnionDef;

function defOf(schema: z.core.$ZodType): Def {
  return (schema as z.core.$ZodTypes)._zod.def;
}

function isDiscriminated(def: UnionDef): def is DiscriminatedUnionDef {
  return 'discriminator' in def;
}

/** A discriminated union's kinds, each with the object it reads. */
function kindsOf(union: DiscriminatedUnionDef): Map<unknown, z.core.$ZodType> {
  return new Map(
    union.options.flatMap((option) =>
      [...(option._zod.propValues?.[union.discriminator] ?? [])].map((kind) => [kind, option]),
    ),
  );
}

/** What a pipe checks: `z.preprocess(…)`'s schema is its `out`, `.transform(…)`'s its `in`. */
function checkedBy(pipe: Extract<Def, { type: 'pipe' }>): z.core.$ZodType {
  return defOf(pipe.in).type === 'transform' ? pipe.out : pipe.in;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `value` with an unknown field added to every object `schema` reads as an
 * object, nested ones included: what a newer server could send. A client that
 * reads tolerantly parses it to what it parses `value` to. A record gains no
 * key, since its keys are its data, and neither does an object that names
 * what its other keys hold.
 */
export function withUnknownFields(schema: z.core.$ZodType, value: unknown): unknown {
  const def = defOf(schema);
  switch (def.type) {
    case 'object': {
      if (!isPlainObject(value)) return value;
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        const field = def.shape[key];
        out[key] = field ? withUnknownFields(field, child) : child;
      }
      if (def.catchall && defOf(def.catchall).type !== 'never') return out;
      return { ...out, [UNKNOWN_FIELD]: UNKNOWN_VALUE };
    }
    case 'array':
      return Array.isArray(value)
        ? value.map((item) => withUnknownFields(def.element, item))
        : value;
    case 'tuple':
      return Array.isArray(value)
        ? value.map((item, index) => {
            const element = def.items[index] ?? def.rest;
            return element ? withUnknownFields(element, item) : item;
          })
        : value;
    case 'record':
      return isPlainObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              withUnknownFields(def.valueType, child),
            ]),
          )
        : value;
    case 'optional':
    case 'nullable':
    case 'default':
    case 'catch':
    case 'readonly':
      return value === undefined || value === null
        ? value
        : withUnknownFields(def.innerType, value);
    case 'lazy':
      return withUnknownFields(def.getter(), value);
    case 'pipe':
      return withUnknownFields(checkedBy(def), value);
    case 'intersection':
      return withUnknownFields(def.right, withUnknownFields(def.left, value));
    case 'union': {
      const option = isDiscriminated(def)
        ? isPlainObject(value) && kindsOf(def).get(value[def.discriminator])
        : def.options.find((candidate) => z.safeParse(candidate, value).success);
      return option ? withUnknownFields(option, value) : value;
    }
    default:
      return value;
  }
}

function describeSet(def: Def): string {
  switch (def.type) {
    case 'enum':
      return JSON.stringify(Object.values(def.entries));
    case 'literal':
      return JSON.stringify(def.values.length === 1 ? def.values[0] : def.values);
    case 'union':
      return isDiscriminated(def)
        ? `the union of ${JSON.stringify([...kindsOf(def).keys()])}`
        : `the union of ${def.options.length} kinds`;
    default:
      return def.type;
  }
}

/** The field whose literal tells a union's objects apart, the way a discriminated union's does. */
function tagOf(options: readonly z.core.$ZodType[]): string | undefined {
  const shapes = options.map((option) => {
    const def = defOf(option);
    return def.type === 'object' ? def.shape : null;
  });
  if (shapes.some((shape) => shape === null)) return undefined;
  return Object.keys(shapes[0]!).find((key) =>
    shapes.every((shape) => shape![key] && defOf(shape![key]!).type === 'literal'),
  );
}

/** A union a response carries with a catch-all kind (`withCatchAll`). */
export interface OpenUnion {
  /** Where the walk first reached it. */
  at: string;
  /** The field whose value names the kind. */
  tag: string;
  /** The kind a kind the client doesn't know reads as. */
  catchAll: string;
  /** Every kind the union lists, the catch-all included. */
  kinds: string[];
}

/**
 * Where reading a response with `schema` isn't tolerant
 * (docs/conventions/api-evolution.md, "Reading tolerantly"): an object that
 * refuses unknown fields, and a set (an enum, a literal or a union's kinds)
 * that is neither closed nor names what a value it doesn't know reads as.
 * Each is reported once, at the first path that reaches it.
 */
export function readingProblems(schema: z.core.$ZodType, path = 'response'): string[] {
  const problems: string[] = [];
  walk(schema, path, { problem: (problem) => problems.push(problem), openUnion: () => {} });
  return problems;
}

/** Every union with a catch-all kind a response read with `schema` carries, nested ones included. */
export function openUnionsIn(schema: z.core.$ZodType, path = 'response'): OpenUnion[] {
  const unions: OpenUnion[] = [];
  walk(schema, path, { problem: () => {}, openUnion: (union) => unions.push(union) });
  return unions;
}

/** `schema` itself as a union with a catch-all kind, or `undefined` when it isn't one. */
export function openUnionOf(schema: z.core.$ZodType): OpenUnion | undefined {
  const def = defOf(schema);
  switch (def.type) {
    case 'lazy':
      return openUnionOf(def.getter());
    case 'optional':
    case 'nullable':
      return openUnionOf(def.innerType);
    case 'pipe': {
      const reading = readingOf(schema);
      const inner = defOf(checkedBy(def));
      return reading && 'unknownAs' in reading && inner.type === 'union' && isDiscriminated(inner)
        ? unionAt('response', inner, reading.unknownAs)
        : undefined;
    }
    default:
      return undefined;
  }
}

function unionAt(at: string, union: DiscriminatedUnionDef, catchAll: string): OpenUnion {
  return { at, tag: union.discriminator, catchAll, kinds: [...kindsOf(union).keys()].map(String) };
}

function walk(
  schema: z.core.$ZodType,
  path: string,
  report: { problem(problem: string): void; openUnion(union: OpenUnion): void },
): void {
  const seen = new Set<unknown>();

  const unmarked = (set: z.core.$ZodType, at: string) => {
    if (!readingOf(set)) {
      report.problem(
        `${at}: ${describeSet(defOf(set))} is neither closed nor read with a fallback`,
      );
    }
  };

  /** `discriminator` names the key an object's union reads, which that union's reading covers. */
  const visit = (current: z.core.$ZodType, at: string, discriminator?: string): void => {
    const def = defOf(current);
    if (seen.has(def)) return;
    seen.add(def);
    switch (def.type) {
      case 'object': {
        const rest = def.catchall && defOf(def.catchall).type;
        if (rest === 'never') report.problem(`${at}: refuses unknown fields`);
        for (const [key, field] of Object.entries(def.shape)) {
          if (key === discriminator) continue;
          visit(field, `${at}.${key}`);
        }
        if (def.catchall && rest !== 'never') visit(def.catchall, `${at}.*`);
        return;
      }
      case 'enum':
      case 'literal':
        unmarked(current, at);
        return;
      case 'union': {
        if (isDiscriminated(def)) {
          unmarked(current, at);
          for (const [kind, option] of kindsOf(def)) {
            visit(option, `${at}<${String(kind)}>`, def.discriminator);
          }
          return;
        }
        const options = def.options;
        const kinds = options.filter((option) =>
          ['literal', 'object', 'enum'].includes(defOf(option).type),
        );
        // A union of kinds is a set; a union of types (a string or a number) is not.
        if (kinds.length > 1) {
          unmarked(current, at);
          const tag = tagOf(options);
          options.forEach((option, index) => {
            if (defOf(option).type !== 'literal') visit(option, `${at}|${index}`, tag);
          });
          return;
        }
        options.forEach((option, index) => visit(option, `${at}|${index}`));
        return;
      }
      case 'pipe': {
        const reading = readingOf(current);
        if (reading === undefined) {
          for (const side of [def.in, def.out]) {
            if (defOf(side).type !== 'transform') visit(side, at, discriminator);
          }
          return;
        }
        // An open enum is read whole; a union with a catch-all still reads each kind.
        const inner = defOf(checkedBy(def));
        if (inner.type === 'union' && isDiscriminated(inner)) {
          if ('unknownAs' in reading) report.openUnion(unionAt(at, inner, reading.unknownAs));
          seen.add(inner);
          for (const [kind, option] of kindsOf(inner)) {
            visit(option, `${at}<${String(kind)}>`, inner.discriminator);
          }
        }
        return;
      }
      case 'array':
        visit(def.element, `${at}[]`);
        return;
      case 'set':
        visit(def.valueType, `${at}[]`);
        return;
      case 'tuple':
        def.items.forEach((item, index) => visit(item, `${at}[${index}]`));
        if (def.rest) visit(def.rest, `${at}[]`);
        return;
      case 'record':
      case 'map':
        visit(def.keyType, `${at}{key}`);
        visit(def.valueType, `${at}{}`);
        return;
      case 'optional':
      case 'nullable':
      case 'default':
      case 'catch':
      case 'readonly':
        visit(def.innerType, at, discriminator);
        return;
      case 'lazy':
        visit(def.getter(), at, discriminator);
        return;
      case 'intersection':
        visit(def.left, at, discriminator);
        visit(def.right, at, discriminator);
        return;
      default:
        return;
    }
  };

  visit(schema, path);
}
