import { describe, expect, test } from 'vitest';
import { ANNOTATION_DEFAULTS } from '../../src/annotation/defaults';
import { declarationOf } from '../../src/annotation/kinds';

describe('ANNOTATION_DEFAULTS', () => {
  for (const [subtype, defaults] of Object.entries(ANNOTATION_DEFAULTS)) {
    test(`${subtype}: every default is a value its field reads`, () => {
      const fields = declarationOf(subtype)?.fields ?? {};
      for (const [name, value] of Object.entries(defaults)) {
        const field = (
          fields as Record<
            string,
            {
              read: { safeParse(value: unknown): { success: boolean } };
              traits: { owner: string; required: boolean };
            }
          >
        )[name];
        expect(field, `${subtype}.${name} is declared`).toBeDefined();
        expect(field!.traits.owner, `${subtype}.${name} is data`).toBe('data');
        expect(field!.traits.required, `${subtype}.${name} is optional`).toBe(false);
        expect(
          field!.read.safeParse(value).success,
          `${subtype}.${name} = ${JSON.stringify(value)}`,
        ).toBe(true);
      }
    });
  }
});
