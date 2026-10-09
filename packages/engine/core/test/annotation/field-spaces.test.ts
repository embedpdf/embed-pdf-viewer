import { describe, expect, test } from 'vitest';
import type { z } from 'zod';

import type { AnyField } from '../../src/annotation/declaration';
import { ANNOTATION_FIELD_SPACES } from '../../src/annotation/field-spaces';
import { ANNOTATION_DECLARATIONS } from '../../src/annotation/kinds/declarations';

/**
 * Whether a schema holds something that looks like a place on a page: an
 * object with `x` and `y`, or with `left` and `top` (a rect, a box's corner, a
 * destination), anywhere inside it.
 */
function holdsPlace(schema: z.ZodTypeAny, seen = new Set<z.ZodTypeAny>()): boolean {
  if (seen.has(schema)) return false;
  seen.add(schema);
  const def = schema._def as Record<string, unknown> & { typeName: string };
  const inner = (value: unknown) => holdsPlace(value as z.ZodTypeAny, seen);
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const keys = Object.keys(shape);
      const has = (...names: string[]) => names.every((name) => keys.includes(name));
      return has('x', 'y') || has('left', 'top') || Object.values(shape).some(inner);
    }
    case 'ZodArray':
      return inner(def.type);
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodReadonly':
    case 'ZodCatch':
      return inner(def.innerType);
    case 'ZodBranded':
      return inner(def.type);
    case 'ZodEffects':
      return inner(def.schema);
    case 'ZodLazy':
      return inner((def.getter as () => z.ZodTypeAny)());
    case 'ZodUnion':
      return (def.options as z.ZodTypeAny[]).some(inner);
    case 'ZodDiscriminatedUnion':
      return [...(def.options as z.ZodTypeAny[])].some(inner);
    case 'ZodTuple':
      return (def.items as z.ZodTypeAny[]).some(inner) || (def.rest ? inner(def.rest) : false);
    case 'ZodRecord':
      return inner(def.valueType);
    case 'ZodIntersection':
      return inner(def.left) || inner(def.right);
    case 'ZodPipeline':
      return inner(def.in) || inner(def.out);
    default:
      return false;
  }
}

const spaceOf = (field: AnyField) => field.traits.space;

describe('ANNOTATION_FIELD_SPACES', () => {
  test.each(ANNOTATION_DECLARATIONS.map((declaration) => [declaration.subtype, declaration]))(
    'lists exactly the measured fields %s declares',
    (subtype, declaration) => {
      const declared = Object.fromEntries(
        Object.entries(declaration.fields as Record<string, AnyField>)
          .filter(([, field]) => spaceOf(field) !== 'none')
          .map(([name, field]) => [name, spaceOf(field)]),
      );
      expect(ANNOTATION_FIELD_SPACES[subtype as keyof typeof ANNOTATION_FIELD_SPACES]).toEqual(
        declared,
      );
    },
  );

  test.each(ANNOTATION_DECLARATIONS.map((declaration) => [declaration.subtype, declaration]))(
    'every field of %s that holds a place on the page says what it holds',
    (_subtype, declaration) => {
      for (const [name, field] of Object.entries(declaration.fields as Record<string, AnyField>)) {
        const place = holdsPlace(field.read) || holdsPlace(field.write);
        const space = spaceOf(field);
        // A field that holds a place must name it; one that names a place must hold one.
        expect({ name, holdsPlace: place, space: space === 'none' ? 'none' : 'named' }).toEqual({
          name,
          holdsPlace: place,
          space: place ? 'named' : 'none',
        });
      }
    },
  );
});
