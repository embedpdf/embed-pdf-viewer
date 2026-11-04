import type { z } from 'zod';

import { readingOf } from '../wire/reading';

/** The field {@link withUnknownFields} adds: one a newer server could send. */
export const UNKNOWN_FIELD = 'fieldFromANewerServer';

const UNKNOWN_VALUE = { nested: { values: [1, 'two', null] } };

type AnyDef = Record<string, any> & { typeName: string };

function defOf(schema: z.ZodTypeAny): AnyDef {
  return schema._def as AnyDef;
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
export function withUnknownFields(schema: z.ZodTypeAny, value: unknown): unknown {
  const def = defOf(schema);
  switch (def.typeName) {
    case 'ZodObject': {
      if (!isPlainObject(value)) return value;
      const shape = def.shape() as Record<string, z.ZodTypeAny>;
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        const field = shape[key];
        out[key] = field ? withUnknownFields(field, child) : child;
      }
      if (defOf(def.catchall).typeName !== 'ZodNever') return out;
      return { ...out, [UNKNOWN_FIELD]: UNKNOWN_VALUE };
    }
    case 'ZodArray':
      return Array.isArray(value) ? value.map((item) => withUnknownFields(def.type, item)) : value;
    case 'ZodTuple':
      return Array.isArray(value)
        ? value.map((item, index) => {
            const element = def.items[index] ?? def.rest;
            return element ? withUnknownFields(element, item) : item;
          })
        : value;
    case 'ZodRecord':
      return isPlainObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              withUnknownFields(def.valueType, child),
            ]),
          )
        : value;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodReadonly':
      return value === undefined || value === null
        ? value
        : withUnknownFields(def.innerType, value);
    case 'ZodBranded':
      return withUnknownFields(def.type, value);
    case 'ZodLazy':
      return withUnknownFields(def.getter(), value);
    case 'ZodEffects':
      return withUnknownFields(def.schema, value);
    case 'ZodPipeline':
      return withUnknownFields(def.in, value);
    case 'ZodIntersection':
      return withUnknownFields(def.right, withUnknownFields(def.left, value));
    case 'ZodDiscriminatedUnion': {
      if (!isPlainObject(value)) return value;
      const option = def.optionsMap.get(value[def.discriminator]);
      return option ? withUnknownFields(option, value) : value;
    }
    case 'ZodUnion': {
      const option = (def.options as z.ZodTypeAny[]).find(
        (candidate) => candidate.safeParse(value).success,
      );
      return option ? withUnknownFields(option, value) : value;
    }
    default:
      return value;
  }
}

function describeSet(def: AnyDef): string {
  switch (def.typeName) {
    case 'ZodEnum':
      return JSON.stringify(def.values);
    case 'ZodNativeEnum':
      return JSON.stringify(Object.values(def.values));
    case 'ZodLiteral':
      return JSON.stringify(def.value);
    case 'ZodDiscriminatedUnion':
      return `the union of ${JSON.stringify([...def.optionsMap.keys()])}`;
    default:
      return `the union of ${(def.options as z.ZodTypeAny[]).length} kinds`;
  }
}

/** The field whose literal tells a union's objects apart, the way a discriminated union's does. */
function tagOf(options: z.ZodTypeAny[]): string | undefined {
  const shapes = options.map((option) => {
    const def = defOf(option);
    return def.typeName === 'ZodObject' ? (def.shape() as Record<string, z.ZodTypeAny>) : null;
  });
  if (shapes.some((shape) => shape === null)) return undefined;
  return Object.keys(shapes[0]!).find((key) =>
    shapes.every((shape) => shape![key] && defOf(shape![key]!).typeName === 'ZodLiteral'),
  );
}

/**
 * Where reading a response with `schema` isn't tolerant
 * (docs/conventions/api-evolution.md, "Reading tolerantly"): an object that
 * refuses unknown fields, and a set (an enum, a literal or a union's kinds)
 * that is neither closed nor names what a value it doesn't know reads as.
 * Each is reported once, at the first path that reaches it.
 */
export function readingProblems(schema: z.ZodTypeAny, path = 'response'): string[] {
  const problems: string[] = [];
  const seen = new Set<unknown>();

  const unmarked = (set: z.ZodTypeAny, at: string) => {
    if (!readingOf(set)) {
      problems.push(`${at}: ${describeSet(defOf(set))} is neither closed nor read with a fallback`);
    }
  };

  /** `discriminator` names the key an object's union reads, which that union's reading covers. */
  const visit = (current: z.ZodTypeAny, at: string, discriminator?: string): void => {
    const def = defOf(current);
    if (seen.has(def)) return;
    seen.add(def);
    switch (def.typeName) {
      case 'ZodObject': {
        if (def.unknownKeys === 'strict') problems.push(`${at}: refuses unknown fields`);
        const shape = def.shape() as Record<string, z.ZodTypeAny>;
        for (const [key, field] of Object.entries(shape)) {
          if (key === discriminator) continue;
          visit(field, `${at}.${key}`);
        }
        if (defOf(def.catchall).typeName !== 'ZodNever') visit(def.catchall, `${at}.*`);
        return;
      }
      case 'ZodEnum':
      case 'ZodNativeEnum':
      case 'ZodLiteral':
        unmarked(current, at);
        return;
      case 'ZodDiscriminatedUnion':
        unmarked(current, at);
        for (const [kind, option] of def.optionsMap as Map<unknown, z.ZodTypeAny>) {
          visit(option, `${at}<${String(kind)}>`, def.discriminator);
        }
        return;
      case 'ZodUnion': {
        const options = def.options as z.ZodTypeAny[];
        const kinds = options.filter((option) =>
          ['ZodLiteral', 'ZodObject', 'ZodEnum'].includes(defOf(option).typeName),
        );
        // A union of kinds is a set; a union of types (a string or a number) is not.
        if (kinds.length > 1) {
          unmarked(current, at);
          const tag = tagOf(options);
          options.forEach((option, index) => {
            if (defOf(option).typeName !== 'ZodLiteral') visit(option, `${at}|${index}`, tag);
          });
          return;
        }
        options.forEach((option, index) => visit(option, `${at}|${index}`));
        return;
      }
      case 'ZodEffects': {
        const reading = readingOf(current);
        if (reading === undefined) {
          visit(def.schema, at, discriminator);
          return;
        }
        // An open enum is read whole; a union with a catch-all still reads each kind.
        const inner = defOf(def.schema);
        if (inner.typeName === 'ZodDiscriminatedUnion') {
          seen.add(inner);
          for (const [kind, option] of inner.optionsMap as Map<unknown, z.ZodTypeAny>) {
            visit(option, `${at}<${String(kind)}>`, inner.discriminator);
          }
        }
        return;
      }
      case 'ZodArray':
        visit(def.type, `${at}[]`);
        return;
      case 'ZodSet':
        visit(def.valueType, `${at}[]`);
        return;
      case 'ZodTuple':
        (def.items as z.ZodTypeAny[]).forEach((item, index) => visit(item, `${at}[${index}]`));
        if (def.rest) visit(def.rest, `${at}[]`);
        return;
      case 'ZodRecord':
      case 'ZodMap':
        visit(def.keyType, `${at}{key}`);
        visit(def.valueType, `${at}{}`);
        return;
      case 'ZodOptional':
      case 'ZodNullable':
      case 'ZodDefault':
      case 'ZodCatch':
      case 'ZodReadonly':
        visit(def.innerType, at, discriminator);
        return;
      case 'ZodBranded':
        visit(def.type, at, discriminator);
        return;
      case 'ZodLazy':
        visit(def.getter(), at, discriminator);
        return;
      case 'ZodPipeline':
        visit(def.in, at, discriminator);
        visit(def.out, at, discriminator);
        return;
      case 'ZodIntersection':
        visit(def.left, at, discriminator);
        visit(def.right, at, discriminator);
        return;
      default:
        return;
    }
  };

  visit(schema, path);
  return problems;
}
