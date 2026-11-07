import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  openUnionOf,
  openUnionsIn,
  readingProblems,
  type OpenUnion,
} from '@embedpdf/engine-core/conformance';

import { allOperations, type AdminOperation } from '../src/index';
import { SHARED_COMPONENT_SCHEMAS } from '../src/openapi';

const responses = (Object.values(allOperations) as AdminOperation[]).flatMap((operation) =>
  Object.entries(operation.responses).flatMap(([status, response]) =>
    response.schema
      ? [{ name: `${operation.operationId} ${status}`, schema: response.schema }]
      : [],
  ),
);

/**
 * Clients read every response tolerantly (docs/conventions/api-evolution.md,
 * "Reading tolerantly"): no response schema refuses a field it doesn't know,
 * and every set a response carries is closed or names what a value it
 * doesn't know reads as. The cloud engine's suite checks the same of the
 * responses it reads, with an unknown field added to each of their objects.
 */
describe('every response reads tolerantly', () => {
  for (const { name, schema } of responses) {
    test(name, () => {
      expect(readingProblems(schema, name)).toEqual([]);
    });
  }
});

const tolerantReading = new URL('../../../fern/tolerant-reading/', import.meta.url);

/** One row per open union: what the Python patch and the SDK checks read. */
interface OpenUnionRow {
  name: string;
  tag: string;
  catchAll: string;
  fixtureKind: string;
}
const rows = JSON.parse(
  readFileSync(new URL('open-unions.json', tolerantReading), 'utf8'),
) as OpenUnionRow[];

const signature = ({ tag, catchAll, kinds }: OpenUnion) =>
  `${tag}: ${[...kinds].sort().join('|')} (unknown reads as ${catchAll})`;

const named = Object.entries(SHARED_COMPONENT_SCHEMAS).flatMap(([name, schema]) => {
  const union = openUnionOf(schema);
  return union ? [{ name, union }] : [];
});

/**
 * Every generated SDK reads a kind it doesn't know as its union's catch-all.
 * Fern makes one type per named component, which the Python SDK's patch
 * (fern/scripts/record-sdk-metadata.mjs) and every SDK's check
 * (fern/scripts/check-tolerant-reading.mjs) cover through
 * fern/tolerant-reading/open-unions.json.
 */
describe('every open union reaches every SDK as one named type', () => {
  test('every open union a response carries is a named component', () => {
    const names = new Set(named.map(({ union }) => signature(union)));
    const unnamed = responses
      .flatMap(({ name, schema }) => openUnionsIn(schema, name))
      .filter((union) => !names.has(signature(union)))
      .map((union) => `${union.at}: ${signature(union)}`);
    expect(unnamed).toEqual([]);
  });

  test('openapi.json writes each one out once, as its component', () => {
    type Schema = { $ref?: string; properties?: Record<string, { enum?: unknown[] }> };
    const document: unknown = JSON.parse(
      readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'),
    );
    const resolved = (schema: Schema): Schema =>
      schema.$ref
        ? resolved(
            schema.$ref
              .slice('#/'.length)
              .split('/')
              .reduce<any>((node, key) => node[key], document) as Schema,
          )
        : schema;
    const places = new Map<string, string[]>();
    const visit = (node: unknown, at: string): void => {
      if (typeof node !== 'object' || node === null) return;
      const arms = (node as { anyOf?: unknown }).anyOf;
      if (Array.isArray(arms) && arms.length > 1) {
        const kindsBy = (tag: string) =>
          arms.map((arm) => {
            const values = resolved(arm as Schema).properties?.[tag]?.enum;
            return values?.length === 1 ? String(values[0]) : undefined;
          });
        for (const tag of new Set(named.map(({ union }) => union.tag))) {
          const kinds = kindsBy(tag);
          if (kinds.every((kind) => kind !== undefined)) {
            const key = `${tag}: ${kinds.sort().join('|')}`;
            places.set(key, [...(places.get(key) ?? []), at]);
          }
        }
      }
      for (const [key, child] of Object.entries(node)) visit(child, `${at}/${key}`);
    };
    visit(document, '#');
    for (const { name, union } of named) {
      expect(places.get(`${union.tag}: ${[...union.kinds].sort().join('|')}`), name).toEqual([
        `#/components/schemas/${name}`,
      ]);
    }
  });

  test('open-unions.json has a row for each, with its tag and catch-all', () => {
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    expect(rows.map(({ name, tag, catchAll }) => ({ name, tag, catchAll })).sort(byName)).toEqual(
      named
        .map(({ name, union }) => ({ name, tag: union.tag, catchAll: union.catchAll }))
        .sort(byName),
    );
  });

  test('a fixture the SDKs read carries a kind each union does not list', () => {
    const fixtures = ['annotation-list.json', 'form.json']
      .map((file) => readFileSync(new URL(file, tolerantReading), 'utf8'))
      .join('\n');
    for (const { name, tag, fixtureKind } of rows) {
      const union = named.find((entry) => entry.name === name)!.union;
      expect(union.kinds, name).not.toContain(fixtureKind);
      expect(fixtures, name).toContain(`"${tag}": "${fixtureKind}"`);
    }
  });
});
