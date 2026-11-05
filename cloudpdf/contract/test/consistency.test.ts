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

const isNullable = (schema: Schema): boolean =>
  schema.nullable === true ||
  schema.type === 'null' ||
  [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(isNullable);

const typeOf = (schema: Schema): string | undefined => {
  const target = resolved(schema);
  if (target.type) return target.type;
  const arms = [...(target.anyOf ?? []), ...(target.oneOf ?? []), ...(target.allOf ?? [])]
    .map(typeOf)
    .filter((type) => type !== 'null');
  return arms.length > 0 && arms.every((type) => type === arms[0]) ? arms[0] : undefined;
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

  test('no response field is both nullable and optional', () => {
    const both = responseProperties
      .filter(({ schema, required }) => !required && isNullable(schema))
      .map(({ at }) => at);
    // A destination's axes: left out and `null` both keep the viewer's
    // value, as in the file. Undecided (docs/plans, API consistency).
    expect(unique(both)).toEqual(['PageDestination.x']);
  });
});
