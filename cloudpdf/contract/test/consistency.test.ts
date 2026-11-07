import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

/**
 * The naming rules (docs/conventions/naming.md) that the contract keeps,
 * checked on what every SDK is generated from: `openapi.json`. A rule that
 * fails names each place that breaks it.
 */

interface Schema {
  $ref?: string;
  type?: string;
  nullable?: boolean;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: Schema | boolean;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
}

interface Operation {
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}

const spec = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

const resolved = (schema: Schema): Schema =>
  schema.$ref
    ? resolved(
        schema.$ref
          .slice(2)
          .split('/')
          .reduce<any>((node, key) => node[key], spec),
      )
    : schema;

const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({
    name: `${method.toUpperCase()} ${path}`,
    operation,
  })),
);

interface Property {
  at: string;
  name: string;
  schema: Schema;
  required: boolean;
}

/** Every object property under `schema`, through refs, arrays, maps and unions, each once. */
function propertiesOf(schema: Schema, at: string, seen = new Set<Schema>()): Property[] {
  if (seen.has(schema)) return [];
  seen.add(schema);
  const here = schema.$ref ? schema.$ref.replace('#/components/schemas/', '') : at;
  const target = resolved(schema);
  if (target !== schema) return propertiesOf(target, here, seen);
  const own = Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    at: `${here}.${name}`,
    name,
    schema: property,
    required: schema.required?.includes(name) ?? false,
  }));
  const nested = [
    ...own.map(({ at: path, schema: property }) => ({ path, schema: property })),
    ...(schema.items ? [{ path: `${here}[]`, schema: schema.items }] : []),
    ...(typeof schema.additionalProperties === 'object'
      ? [{ path: `${here}{}`, schema: schema.additionalProperties }]
      : []),
    ...[...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])].map((arm) => ({
      path: here,
      schema: arm,
    })),
  ];
  return [...own, ...nested.flatMap(({ path, schema: next }) => propertiesOf(next, path, seen))];
}

const everyProperty = Object.entries(spec.components.schemas).flatMap(([name, schema]) =>
  propertiesOf(schema, name),
);

const responseProperties = operations.flatMap(({ name, operation }) =>
  Object.entries(operation.responses)
    .filter(([status]) => status.startsWith('2'))
    .flatMap(([status, response]) =>
      Object.values(response.content ?? {}).flatMap(({ schema }) =>
        schema ? propertiesOf(schema, `${name} ${status}`) : [],
      ),
    ),
);

const isNullable = (schema: Schema): boolean => {
  const target = resolved(schema);
  return (
    target.nullable === true ||
    target.type === 'null' ||
    [...(target.anyOf ?? []), ...(target.oneOf ?? [])].some(isNullable)
  );
};

const typeOf = (schema: Schema): string | undefined => {
  const target = resolved(schema);
  if (target.type) return target.type;
  const arms = [...(target.anyOf ?? []), ...(target.oneOf ?? []), ...(target.allOf ?? [])]
    .map(typeOf)
    .filter((type) => type !== 'null');
  return arms.length > 0 && arms.every((type) => type === arms[0]) ? arms[0] : undefined;
};

/** A schema's string format, through refs and a nullable or union wrapper. */
const formatOf = (schema: Schema & { format?: string }): string | undefined => {
  const target = resolved(schema) as Schema & { format?: string };
  if (target.format) return target.format;
  const formats = [...(target.anyOf ?? []), ...(target.oneOf ?? []), ...(target.allOf ?? [])]
    .filter((arm) => resolved(arm).type !== 'null')
    .map(formatOf);
  return formats.length > 0 && formats.every((format) => format === formats[0])
    ? formats[0]
    : undefined;
};

const unique = (places: string[]) => [...new Set(places)].sort();

describe('naming rules in openapi.json', () => {
  test('every error response is the one error body', () => {
    const others = operations.flatMap(({ name, operation }) =>
      Object.entries(operation.responses)
        .filter(([status]) => status === 'default' || Number(status) >= 400)
        .filter(
          ([, response]) =>
            response.content?.['application/json']?.schema?.$ref !==
            '#/components/schemas/ErrorResponse',
        )
        .map(([status]) => `${name} ${status}`),
    );
    expect(others).toEqual([]);
  });

  test('a count, an index, a size in bytes and a duration in seconds are integers', () => {
    const decimals = everyProperty
      .filter(({ name }) => /(Bytes|Seconds|Count|Index)$/.test(name))
      .filter(({ schema }) => typeOf(schema) !== 'integer')
      .map(({ at }) => at);
    expect(unique(decimals)).toEqual([]);
  });

  test('a point in time is an ISO 8601 string', () => {
    const notDates = everyProperty
      .filter(({ name }) => /At$/.test(name))
      // A field a write accepts only to take a read back, and ignores, says nothing (`{}`).
      .filter(({ schema }) => Object.keys(resolved(schema)).length > 0)
      .filter(({ schema }) => formatOf(schema) !== 'date-time')
      .map(({ at }) => at);
    expect(unique(notDates)).toEqual([]);
  });

  test('a field name is camelCase, without dots', () => {
    const odd = everyProperty
      .filter(({ name }) => !/^[a-z][A-Za-z0-9]*$/.test(name))
      .map(({ at }) => at);
    expect(unique(odd)).toEqual([]);
  });

  test('an object is named fields or a map, never both', () => {
    // An "anything else" bag next to fields is untyped in most SDKs.
    const both: string[] = [];
    const visit = (node: unknown, at: string): void => {
      if (typeof node !== 'object' || node === null) return;
      const schema = node as Schema;
      const isMap =
        schema.additionalProperties !== undefined && schema.additionalProperties !== false;
      if (schema.properties && isMap) both.push(at);
      for (const [key, value] of Object.entries(node)) visit(value, `${at}/${key}`);
    };
    visit(spec, '#');
    expect(both).toEqual([]);
  });

  test('a union is tagged type, kind, status or subtype', () => {
    // `type` for what happens, `kind` for what is, `status` for what a call did; `subtype` is
    // the PDF's own /Subtype. A tag is the field every arm fixes to one value.
    const TAGS = new Set(['type', 'kind', 'status', 'subtype']);
    const fixedFields = (arm: Schema): Set<string> => {
      const fields = new Set<string>();
      for (const [name, field] of Object.entries(resolved(arm).properties ?? {})) {
        const { enum: values } = resolved(field) as Schema & { enum?: unknown[] };
        if (values?.length === 1) fields.add(name);
      }
      return fields;
    };
    const odd: string[] = [];
    const visit = (node: unknown, at: string): void => {
      if (typeof node !== 'object' || node === null) return;
      const arms = (node as Schema).oneOf ?? (node as Schema).anyOf;
      if (arms && arms.length > 1) {
        const [first, ...rest] = arms.map(fixedFields);
        const tags = [...first!].filter((name) => rest.every((fields) => fields.has(name)));
        for (const tag of tags) if (!TAGS.has(tag)) odd.push(`${at} (${tag})`);
      }
      for (const [key, value] of Object.entries(node)) visit(value, `${at}/${key}`);
    };
    visit(spec, '#');
    expect(unique(odd)).toEqual([]);
  });

  test('a size in bytes ends in Bytes, and a hash names its algorithm', () => {
    const unnamed = everyProperty
      .filter(({ name }) =>
        /^(contentLength|sha|checksum)$|(^b|B)yteLength$|(^s|S)ize$|Hash$/.test(name),
      )
      // A page's or a rich text's size is its dimensions or a font size, not bytes.
      .filter(({ name, schema }) => !(/(^s|S)ize$/.test(name) && typeOf(schema) !== 'integer'))
      .map(({ at }) => at);
    expect(unique(unnamed)).toEqual([]);
  });

  test('a path parameter is spelled out, and a hash names its algorithm', () => {
    const parameters = Object.keys(spec.paths).flatMap((path) =>
      [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!),
    );
    expect(
      [...new Set(parameters)].filter((name) => /^(id|sha|annotKey)$|Hash$/.test(name)),
    ).toEqual([]);
  });

  test('no response field is both nullable and optional', () => {
    const both = responseProperties
      .filter(({ schema, required }) => !required && isNullable(schema))
      .map(({ at }) => at);
    expect(unique(both)).toEqual([]);
  });

  test('a create takes null only where its read can be null', () => {
    const schemas = spec.components.schemas;
    const creates: Array<[string, Schema, Schema]> = [
      ['AnnotationDraft', schemas.AnnotationDraft!, schemas.Annotation!],
      ['WidgetPlacement', schemas.WidgetPlacement!, schemas.WidgetAnnotation!],
      ['OutlineItemDraft', schemas.OutlineItemDraft!, schemas.OutlineItem!],
      ['FormFieldDraft', schemas.FormFieldDraft!, schemas.FormField!],
      [
        'GrantsCreateRequest',
        schemas.GrantsCreateRequest!,
        resolved(schemas.GrantsGetResponse!).properties!.grant!,
      ],
    ];
    const nullsWithoutRead = creates.flatMap(([name, create, read]) => {
      const readFields = fieldsOf(read);
      return Object.entries(fieldsOf(create))
        .filter(([, field]) => field.some(isNullable))
        .filter(([key]) => !(readFields[key] ?? []).some(isNullable))
        .map(([key]) => `${name}.${key}`);
    });
    expect(unique(nullsWithoutRead)).toEqual([]);
  });
});

/** Each top-level field of an object or a union of objects, with every arm's schema for it. */
function fieldsOf(schema: Schema): Record<string, Schema[]> {
  const target = resolved(schema);
  const fields: Record<string, Schema[]> = {};
  const add = (from: Record<string, Schema[]>) => {
    for (const [key, values] of Object.entries(from)) (fields[key] ??= []).push(...values);
  };
  add(
    Object.fromEntries(
      Object.entries(target.properties ?? {}).map(([key, value]) => [key, [value]]),
    ),
  );
  for (const arm of [...(target.anyOf ?? []), ...(target.oneOf ?? []), ...(target.allOf ?? [])]) {
    add(fieldsOf(arm));
  }
  return fields;
}
