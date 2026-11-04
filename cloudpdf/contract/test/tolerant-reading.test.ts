import { describe, expect, test } from 'vitest';

import { readingProblems } from '@embedpdf/engine-core/conformance';

import { allOperations, type AdminOperation } from '../src/index';

/**
 * Clients read every response tolerantly (docs/conventions/api-evolution.md,
 * "Reading tolerantly"): no response schema refuses a field it doesn't know,
 * and every set a response carries is closed or names what a value it
 * doesn't know reads as. The cloud engine's suite checks the same of the
 * responses it reads, with an unknown field added to each of their objects.
 */
describe('every response reads tolerantly', () => {
  for (const operation of Object.values(allOperations) as AdminOperation[]) {
    for (const [status, response] of Object.entries(operation.responses)) {
      const schema = response.schema;
      if (!schema) continue;
      test(`${operation.operationId} ${status}`, () => {
        expect(readingProblems(schema, `${operation.operationId} ${status}`)).toEqual([]);
      });
    }
  }
});
