/**
 * Zod schemas as OpenAPI 3 schemas, for the emitter in `openapi.ts`.
 *
 * Zod's own `toJSONSchema` writes a reused schema into `$defs` under a made-up
 * name. Here it is written once, where it is first reached, and every other
 * place points at that place (`#/components/schemas/X/properties/…`): the form
 * the SDK generators read.
 *
 * A schema is written as a request sends it: a `preprocess` or a `transform`
 * is the schema it checks, and a `refine` is the schema it refines.
 */
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

/** Every kind of schema zod makes, told apart by its definition's `type`. */
type Def = z.core.$ZodTypes['_zod']['def'];

export function defOf(schema: z.core.$ZodType): Def {
  return (schema as z.core.$ZodTypes)._zod.def;
}

export interface WriteOptions {
  /** Where the schema is written: the first part of every `$ref` to a place in it. */
  readonly basePath?: readonly string[];
  /** Whether a schema reached again points at where it was written, or is written again. */
  readonly reuse: 'ref' | 'inline';
  /**
   * The schema to write at `path` instead; `undefined` writes it as it is.
   * `writtenAt` is where it was written before, if it was.
   */
  readonly override?: (
    schema: z.core.$ZodType,
    path: readonly string[],
    writtenAt: readonly string[] | undefined,
  ) => JsonSchema | undefined;
}

/** `schema` as an OpenAPI 3 schema. */
export function writeSchema(schema: z.core.$ZodType, options: WriteOptions): JsonSchema {
  const writtenAt = new Map<z.core.$ZodType, readonly string[]>();

  /** `property` is the place of the object property being written, whose optionality `required` says. */
  const write = (
    current: z.core.$ZodType,
    path: readonly string[],
    property?: readonly string[],
  ): JsonSchema => {
    const before = writtenAt.get(current);
    const override = options.override?.(current, path, before);
    if (override) return override;
    if (before && options.reuse === 'ref') return { $ref: before.join('/') };
    writtenAt.set(current, path);
    const written = writeNew(current, path, property);
    const description = descriptionOf(current);
    if (description) written['description'] = description;
    return written;
  };

  const writeNew = (
    current: z.core.$ZodType,
    path: readonly string[],
    property?: readonly string[],
  ): JsonSchema => {
    const refined = refinedBy(current);
    if (refined) return write(refined, path, property);

    const def = defOf(current);
    switch (def.type) {
      case 'object': {
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];
        for (const [name, field] of Object.entries(def.shape)) {
          const place = [...path, 'properties', name];
          properties[name] = write(field, place, place);
          if (!z.safeParse(field, undefined).success) required.push(name);
        }
        return {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
          additionalProperties:
            def.catchall && defOf(def.catchall).type !== 'never'
              ? write(def.catchall, [...path, 'additionalProperties'])
              : false,
        };
      }
      case 'record':
        return {
          type: 'object',
          additionalProperties: write(def.valueType, [...path, 'additionalProperties']),
        };
      case 'array':
        return {
          type: 'array',
          items: write(def.element, [...path, 'items']),
          ...arrayLimits(current),
        };
      case 'tuple':
        if (def.rest)
          throw new Error(`A tuple with a rest has no OpenAPI schema (${path.join('/')})`);
        return {
          type: 'array',
          minItems: def.items.length,
          maxItems: def.items.length,
          items: def.items.map((item, index) => write(item, [...path, 'items', String(index)])),
        };
      case 'union':
        return {
          anyOf: def.options.map((option, index) =>
            write(option, [...path, 'anyOf', String(index)]),
          ),
        };
      case 'nullable': {
        const plain = plainTypeOf(def.innerType);
        if (plain) return { type: plain, nullable: true };
        const inner = write(def.innerType, path, property);
        return '$ref' in inner ? { allOf: [inner], nullable: true } : { ...inner, nullable: true };
      }
      case 'optional':
        // A property's optionality is said by the object's `required`.
        if (path === property) return write(def.innerType, path, property);
        return { anyOf: [{ not: {} }, write(def.innerType, [...path, 'anyOf', '1'])] };
      case 'default':
        return { ...write(def.innerType, path, property), default: def.defaultValue };
      case 'lazy':
        return write(def.getter(), path, property);
      case 'pipe':
        return write(defOf(def.in).type === 'transform' ? def.out : def.in, path, property);
      case 'string':
        return stringSchema(current);
      case 'number':
        return numberSchema(current);
      case 'boolean':
        return { type: 'boolean' };
      case 'literal': {
        if (def.values.length !== 1) {
          throw new Error(`A literal of several values has no OpenAPI schema (${path.join('/')})`);
        }
        return { type: typeof def.values[0], enum: [...def.values] };
      }
      case 'enum':
        return { type: 'string', enum: Object.values(def.entries) };
      case 'date':
        // A `Date` a write takes in process arrives over HTTP as its ISO string.
        return { type: 'string', format: 'date-time' };
      case 'null':
        return { enum: ['null'], nullable: true };
      case 'unknown':
      case 'any':
        return {};
      case 'never':
        return { not: {} };
      default:
        throw new Error(`A ${def.type} schema has no OpenAPI schema (${path.join('/')})`);
    }
  };

  return write(schema, options.basePath ?? ['#']);
}

/**
 * What `schema` is described as: its own description, or that of what it
 * wraps, so `.describe(…)` says the same before and after `.optional()`.
 */
function descriptionOf(schema: z.core.$ZodType): string | undefined {
  const own = z.globalRegistry.get(schema)?.description;
  if (own) return own;
  const def = defOf(schema);
  return def.type === 'optional' || def.type === 'nullable' || def.type === 'default'
    ? descriptionOf(def.innerType)
    : undefined;
}

/**
 * The schema `schema` refines (`.refine(…)`, `.superRefine(…)`), if it is a
 * refinement: zod makes a refinement a copy with one more check.
 */
function refinedBy(schema: z.core.$ZodType): z.core.$ZodType | undefined {
  const checks = defOf(schema).checks ?? [];
  if (checks.at(-1)?._zod.def.check !== 'custom') return undefined;
  let refinement = schema;
  // A copy with a description shares its definition with what it copies.
  while (refinement._zod.parent?._zod.def === refinement._zod.def) {
    refinement = refinement._zod.parent;
  }
  return refinement._zod.parent;
}

/** The type of a string, number, boolean or null nothing more is asked of. */
function plainTypeOf(schema: z.core.$ZodType): string | undefined {
  const def = defOf(schema);
  if (def.checks && def.checks.length > 0) return undefined;
  return ['string', 'number', 'boolean', 'null'].includes(def.type) ? def.type : undefined;
}

/** The checks zod's own types carry, as data. */
type Check = {
  check: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  length?: number;
  value?: number;
  inclusive?: boolean;
};

/** The checks on `schema` itself; a refinement's says nothing a schema can. */
function checksOf(schema: z.core.$ZodType): Check[] {
  return (defOf(schema).checks ?? [])
    .map((check) => check._zod.def as Check)
    .filter((check) => check.check !== 'custom');
}

function arrayLimits(schema: z.core.$ZodType): JsonSchema {
  let minItems: number | undefined;
  let maxItems: number | undefined;
  for (const check of checksOf(schema)) {
    switch (check.check) {
      case 'min_length':
        minItems = check.minimum;
        break;
      case 'max_length':
        maxItems = check.maximum;
        break;
      case 'length_equals':
        minItems = maxItems = check.length;
        break;
      default:
        throw new Error(`An array's ${check.check} check has no OpenAPI schema`);
    }
  }
  return {
    ...(minItems === undefined ? {} : { minItems }),
    ...(maxItems === undefined ? {} : { maxItems }),
  };
}

const STRING_FORMATS: Readonly<Record<string, string>> = { url: 'uri', datetime: 'date-time' };

function stringSchema(schema: z.core.$ZodType): JsonSchema {
  const written: JsonSchema = { type: 'string' };
  const patterns: string[] = [];
  for (const check of checksOf(schema)) {
    switch (check.check) {
      case 'min_length':
        written['minLength'] = check.minimum;
        break;
      case 'max_length':
        written['maxLength'] = check.maximum;
        break;
      case 'length_equals':
        written['minLength'] = check.length;
        written['maxLength'] = check.length;
        break;
      case 'string_format':
        if (check.format === 'regex') {
          patterns.push(check.pattern!.source);
          if (patterns.length === 1) written['pattern'] = patterns[0];
        } else if (check.format && STRING_FORMATS[check.format]) {
          written['format'] = STRING_FORMATS[check.format];
        } else {
          throw new Error(`A string's ${check.format} check has no OpenAPI schema`);
        }
        break;
      case 'overwrite': // `.trim()` and the like: what is sent stays a string.
        break;
      default:
        throw new Error(`A string's ${check.check} check has no OpenAPI schema`);
    }
  }
  if (patterns.length > 1) {
    delete written['pattern'];
    written['allOf'] = patterns.map((pattern) => ({ pattern }));
  }
  return written;
}

function numberSchema(schema: z.core.$ZodType): JsonSchema {
  const written: JsonSchema = { type: 'number' };
  for (const check of checksOf(schema)) {
    switch (check.check) {
      case 'number_format':
        written['type'] = 'integer';
        break;
      case 'greater_than':
        if (!check.inclusive) written['exclusiveMinimum'] = true;
        written['minimum'] = check.value;
        break;
      case 'less_than':
        if (!check.inclusive) written['exclusiveMaximum'] = true;
        written['maximum'] = check.value;
        break;
      default:
        throw new Error(`A number's ${check.check} check has no OpenAPI schema`);
    }
  }
  return written;
}
