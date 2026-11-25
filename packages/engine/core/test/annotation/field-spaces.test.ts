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
function holdsPlace(schema: z.core.$ZodType, seen = new Set<z.core.$ZodType>()): boolean {
  if (seen.has(schema)) return false;
  seen.add(schema);
  const def = (schema as z.core.$ZodTypes)._zod.def;
  const inner = (value: z.core.$ZodType) => holdsPlace(value, seen);
  switch (def.type) {
    case 'object': {
      const keys = Object.keys(def.shape);
      const has = (...names: string[]) => names.every((name) => keys.includes(name));
      return has('x', 'y') || has('left', 'top') || Object.values(def.shape).some(inner);
    }
    case 'array':
      return inner(def.element);
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
    case 'catch':
      return inner(def.innerType);
    case 'lazy':
      return inner(def.getter());
    case 'union':
      return def.options.some(inner);
    case 'tuple':
      return def.items.some(inner) || (def.rest ? inner(def.rest) : false);
    case 'record':
      return inner(def.valueType);
    case 'intersection':
      return inner(def.left) || inner(def.right);
    case 'pipe':
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
