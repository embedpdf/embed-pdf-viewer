import { z } from 'zod';

import type { AnnotationResourceRole } from './resources';
import type { PdfAnnotationActions } from '../dto/PdfAction';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { PageBox } from '../geometry/pageSpace';

/**
 * One declaration per annotation kind. Each field says who writes it, what it
 * reads as, what a write accepts, and whether it can be absent. The read,
 * create and update shapes and their zod schemas are derived from it, so they
 * can't drift apart.
 *
 * - A read is complete: every field is present, and `null` when absent.
 * - A create takes the data fields; a field left out gets the kind's default.
 * - An update takes any data field; a field left out is unchanged, `null`
 *   removes it, and a value replaces it whole.
 * - Attribution, engine and preserved fields are accepted on every write, so
 *   a read DTO can be passed straight back. A data field whose read has more
 *   values than a write can make (`readBack()`) takes them in an update too:
 *   sent back unchanged it is kept, any other such value is refused. An
 *   engine field marked `readBack()` is worked out from other fields: an
 *   update takes the value a read returned. The one such field, a drawn
 *   kind's `rect`, also takes another rect, which puts the shape there
 *   (`shapeForRect`).
 */

/**
 * Who writes a field.
 *
 * - `data`: the caller, on create and update.
 * - `attribution`: the engine, from the session's identity; an import may
 *   restore it.
 * - `engine`: the engine only; addresses, links it keeps in sync, values
 *   derived from other fields.
 * - `preserved`: read from the PDF but not writable. An update that sends it
 *   back keeps it; a copy leaves it out and reports it.
 */
export type FieldOwner = 'data' | 'attribution' | 'engine' | 'preserved';

/**
 * What a field holds that is measured on the page, so a value can be
 * converted between the file's coordinates and page space (see
 * `geometry/pageSpace.ts`).
 *
 * - `none`: nothing measured on the page.
 * - `length`: numbers with position-like names that are sizes, not places
 *   (a paragraph's margins); never converted.
 * - `point`, `points`, `strokes` (lists of points), `box`, `quads`,
 *   `linePoints` (`{ start, end }`), `calloutLine` (two or three points),
 *   `topLeft` (a box's left and top edges): places on the annotation's page.
 * - `measure`: a scale whose `origin` is a place on the page.
 * - `linkTarget`, `actions`: destinations, each measured on the page it
 *   goes to.
 */
export type FieldSpace =
  | 'none'
  | 'length'
  | 'point'
  | 'points'
  | 'strokes'
  | 'box'
  | 'quads'
  | 'linePoints'
  | 'calloutLine'
  | 'measure'
  | 'linkTarget'
  | 'actions';

export interface FieldTraits {
  readonly owner: FieldOwner;
  /** A read returns `null` when the PDF entry is absent. */
  readonly readNullable: boolean;
  /** A write may send `null` to leave the entry out or remove it. */
  readonly writeNullable: boolean;
  /** A create must supply the field: it has no default. */
  readonly required: boolean;
  /** The field can't change after create. */
  readonly createOnly: boolean;
  /** An update also takes what a read returns (kept only when unchanged). */
  readonly readBack: boolean;
  /** What the field holds that is measured on the page. */
  readonly space: FieldSpace;
}

export type Override<Traits, Changed> = Omit<Traits, keyof Changed> & Changed;

export interface Field<Read, Write, Traits> {
  readonly read: z.ZodType<Read>;
  readonly write: z.ZodType<Write>;
  readonly traits: Traits & FieldTraits;
  /** An absent entry reads as `null`, and a write may send `null`. */
  nullable(): Field<Read, Write, Override<Traits, { readNullable: true; writeNullable: true }>>;
  /** An absent entry reads as `null`, but a write must send a value. */
  nullableOnRead(): Field<Read, Write, Override<Traits, { readNullable: true }>>;
  /** A create may leave the field out, and the kind's default applies. */
  optional(): Field<Read, Write, Override<Traits, { required: false }>>;
  /** The field can't change after create. */
  createOnly(): Field<Read, Write, Override<Traits, { createOnly: true }>>;
  /** A write accepts a different schema than a read returns. */
  writes<NextWrite>(schema: z.ZodType<NextWrite>): Field<Read, NextWrite, Traits>;
  /**
   * An update also takes the values only a read returns, so a read DTO can
   * be sent back: such a value is kept when it's unchanged and refused
   * otherwise. A create still takes only what `writes` accepts. On an engine
   * field every value is a read's: any other than the current one is refused.
   */
  readBack(): Field<Read, Write, Override<Traits, { readBack: true }>>;
  /** What the field holds that is measured on the page. */
  space<Space extends FieldSpace>(
    space: Space,
  ): Field<Read, Write, Override<Traits, { space: Space }>>;
}

export type AnyField = Field<any, any, any>;

export type KindFields = { readonly [name: string]: AnyField };

function createField<Read, Write, Traits>(
  read: z.ZodType<Read>,
  write: z.ZodType<Write>,
  traits: Traits & FieldTraits,
): Field<Read, Write, Traits> {
  const next = <Changed extends Partial<FieldTraits>>(changed: Changed) =>
    createField(read, write, { ...traits, ...changed }) as never;
  return {
    read,
    write,
    traits,
    nullable: () => next({ readNullable: true, writeNullable: true }),
    nullableOnRead: () => next({ readNullable: true }),
    optional: () => next({ required: false }),
    createOnly: () => next({ createOnly: true }),
    readBack: () => next({ readBack: true }),
    space: (space) => next({ space }),
    writes: (schema) => createField(read, schema, traits),
  };
}

export interface OwnerTraits<Owner extends FieldOwner, Required extends boolean> {
  owner: Owner;
  readNullable: false;
  writeNullable: false;
  required: Required;
  createOnly: false;
  readBack: false;
  space: 'none';
}

const ownedBy = <Owner extends FieldOwner, Required extends boolean>(
  owner: Owner,
  required: Required,
): OwnerTraits<Owner, Required> => ({
  owner,
  readNullable: false,
  writeNullable: false,
  required,
  createOnly: false,
  readBack: false,
  space: 'none',
});

/** Field builders for {@link defineKind}. */
export const field = {
  /** Written by the caller. Required on create until marked `optional()`. */
  data: <Value>(schema: z.ZodType<Value>) => createField(schema, schema, ownedBy('data', true)),
  /** Stamped by the engine from the session's identity. */
  attribution: <Value>(schema: z.ZodType<Value>) =>
    createField(schema, schema, ownedBy('attribution', false)),
  /** Written only by the engine. */
  engine: <Value>(schema: z.ZodType<Value>) =>
    createField(schema, schema, ownedBy('engine', false)),
  /** Read from the PDF and kept in place, but not writable. */
  preserved: <Value>(schema: z.ZodType<Value>) =>
    createField(schema, schema, ownedBy('preserved', false)),
};

// ── derived shapes ──

type Simplify<Shape> = { [Name in keyof Shape]: Shape[Name] } & {};

type ReadValue<F> =
  F extends Field<infer Read, infer _Write, infer Traits>
    ? Traits extends { readNullable: true }
      ? Read | null
      : Read
    : never;

type WriteValue<F> =
  F extends Field<infer _Read, infer Write, infer Traits>
    ? Traits extends { writeNullable: true }
      ? Write | null
      : Write
    : never;

/** What an update takes: the write, and for a `readBack()` field the read too. */
type UpdateValue<F> =
  F extends Field<infer Read, infer _Write, infer Traits>
    ? Traits extends { readBack: true }
      ? WriteValue<F> | (Traits extends { readNullable: true } ? Read | null : Read)
      : WriteValue<F>
    : never;

type NamesWhere<Fields extends KindFields, Condition> = {
  [Name in keyof Fields]: Fields[Name]['traits'] extends Condition ? Name : never;
}[keyof Fields];

type AcceptedNames<Fields extends KindFields> = NamesWhere<
  Fields,
  { owner: 'attribution' | 'engine' | 'preserved' }
>;

export type ReadShape<Fields extends KindFields> = {
  [Name in keyof Fields]: ReadValue<Fields[Name]>;
};

export type CreateShape<Fields extends KindFields> = {
  [Name in NamesWhere<Fields, { owner: 'data'; required: true }>]: WriteValue<Fields[Name]>;
} & {
  [Name in NamesWhere<Fields, { owner: 'data'; required: false }>]?: WriteValue<Fields[Name]>;
} & {
  [Name in AcceptedNames<Fields>]?: ReadValue<Fields[Name]>;
};

export type UpdateShape<Fields extends KindFields> = {
  [Name in NamesWhere<Fields, { owner: 'data' }>]?: UpdateValue<Fields[Name]>;
} & {
  [Name in AcceptedNames<Fields>]?: ReadValue<Fields[Name]>;
};

// ── page space ──

type SpaceOf<F> = F extends { traits: { space: infer Space } } ? Space : never;

/**
 * A field's value in page space, by what the field holds: a box becomes a
 * `PageBox` and a destination a `PageDestination`. Points keep their shape (`{ x, y }`), so
 * their type is the same in both spaces. `null` and a value left out stay as
 * they are.
 */
export type PageValue<Space, Value> = Value extends null | undefined
  ? Value
  : Space extends 'box'
    ? PageBox
    : Space extends 'linkTarget'
      ? Value extends { destination: PdfDestination }
        ? Omit<Value, 'destination'> & { destination: PageDestination }
        : Value
      : Space extends 'actions'
        ? PdfAnnotationActions<PageDestination>
        : Value;

type PageFieldRead<F> = PageValue<SpaceOf<F>, ReadValue<F>>;
type PageFieldWrite<F> = PageValue<SpaceOf<F>, WriteValue<F>>;
type PageFieldUpdate<F> = PageValue<SpaceOf<F>, UpdateValue<F>>;

export type PageReadShape<Fields extends KindFields> = {
  [Name in keyof Fields]: PageFieldRead<Fields[Name]>;
};

export type PageCreateShape<Fields extends KindFields> = {
  [Name in NamesWhere<Fields, { owner: 'data'; required: true }>]: PageFieldWrite<Fields[Name]>;
} & {
  [Name in NamesWhere<Fields, { owner: 'data'; required: false }>]?: PageFieldWrite<Fields[Name]>;
} & {
  [Name in AcceptedNames<Fields>]?: PageFieldRead<Fields[Name]>;
};

export type PageUpdateShape<Fields extends KindFields> = {
  [Name in NamesWhere<Fields, { owner: 'data' }>]?: PageFieldUpdate<Fields[Name]>;
} & {
  [Name in AcceptedNames<Fields>]?: PageFieldRead<Fields[Name]>;
};

// ── kinds ──

/** The resources a kind takes, by role (`annotation/resources.ts`). */
export type KindResources = { readonly [Role in AnnotationResourceRole]?: 'required' | 'optional' };

export type KindRead<Subtype extends string, Fields extends KindFields> = Simplify<
  { subtype: Subtype } & ReadShape<Fields>
>;
export type KindCreate<Subtype extends string, Fields extends KindFields> = Simplify<
  { subtype: Subtype } & CreateShape<Fields>
>;
export type KindUpdate<Subtype extends string, Fields extends KindFields> = Simplify<
  { subtype?: Subtype } & UpdateShape<Fields>
>;

export interface KindDeclaration<
  Subtype extends string,
  Fields extends KindFields,
  Resources extends KindResources,
> {
  readonly subtype: Subtype;
  readonly fields: Fields;
  readonly resources: Resources;
  /**
   * Validates a read: every field present. Fields it doesn't declare are
   * dropped, so a reader tolerates a newer writer.
   */
  readonly readSchema: z.ZodType<KindRead<Subtype, Fields>>;
  /** Validates the data of a create. */
  readonly createSchema: z.ZodType<KindCreate<Subtype, Fields>>;
  /** Validates the data of an update. */
  readonly updateSchema: z.ZodType<KindUpdate<Subtype, Fields>>;
  /**
   * The write schema of each `readBack()` field: an update's value outside
   * it is a read-only value, kept only when unchanged. `null` for an engine
   * field, which no value writes.
   */
  readonly readBackWrites: Readonly<Record<string, z.ZodTypeAny | null>>;
  /** The zod shapes behind the three schemas, to build variants from. */
  readonly shapes: {
    readonly read: z.ZodRawShape;
    readonly create: z.ZodRawShape;
    readonly update: z.ZodRawShape;
  };
}

export type AnyKindDeclaration = KindDeclaration<string, KindFields, any>;

/** The complete read shape of a kind: what `list`, `get` and `listRaw` return. */
export type ReadOf<Declaration> =
  Declaration extends KindDeclaration<infer Subtype, infer Fields, infer _Resources>
    ? KindRead<Subtype, Fields>
    : never;

/** The data a create accepts. A read of the same kind is always assignable. */
export type CreateOf<Declaration> =
  Declaration extends KindDeclaration<infer Subtype, infer Fields, infer _Resources>
    ? KindCreate<Subtype, Fields>
    : never;

/** The data an update accepts. */
export type UpdateOf<Declaration> =
  Declaration extends KindDeclaration<infer Subtype, infer Fields, infer _Resources>
    ? KindUpdate<Subtype, Fields>
    : never;

/** A kind's complete read in page space. */
export type PageReadOf<Declaration> =
  Declaration extends KindDeclaration<infer Subtype, infer Fields, infer _Resources>
    ? Simplify<{ subtype: Subtype } & PageReadShape<Fields>>
    : never;

/** The data a create accepts, in page space. */
export type PageCreateOf<Declaration> =
  Declaration extends KindDeclaration<infer Subtype, infer Fields, infer _Resources>
    ? Simplify<{ subtype: Subtype } & PageCreateShape<Fields>>
    : never;

/** The data an update accepts, in page space. */
export type PageUpdateOf<Declaration> =
  Declaration extends KindDeclaration<infer Subtype, infer Fields, infer _Resources>
    ? Simplify<{ subtype?: Subtype } & PageUpdateShape<Fields>>
    : never;

/**
 * Declares an annotation kind from its fields and the resources it takes
 * beside its data.
 */
export function defineKind<
  Subtype extends string,
  Fields extends KindFields,
  Resources extends KindResources = Record<never, never>,
>(
  subtype: Subtype,
  fields: Fields,
  resources: Resources = {} as Resources,
): KindDeclaration<Subtype, Fields, Resources> {
  const read: Record<string, z.ZodTypeAny> = { subtype: z.literal(subtype) };
  const create: Record<string, z.ZodTypeAny> = { subtype: z.literal(subtype) };
  const update: Record<string, z.ZodTypeAny> = { subtype: z.literal(subtype).optional() };
  const readBackWrites: Record<string, z.ZodTypeAny | null> = {};
  for (const [name, spec] of Object.entries(fields)) {
    const { owner, readNullable, writeNullable, required, readBack } = spec.traits;
    read[name] = readNullable ? spec.read.nullable() : spec.read;
    if (owner === 'data') {
      const write = writeNullable ? spec.write.nullable() : spec.write;
      create[name] = required ? write : write.optional();
      update[name] = (readBack ? z.union([write, read[name]!]) : write).optional();
      if (readBack) readBackWrites[name] = write;
    } else {
      // Accepted so a read DTO can be sent back; the engine decides what happens to it.
      create[name] = z.unknown().optional();
      update[name] = readBack ? read[name]!.optional() : z.unknown().optional();
      if (readBack) readBackWrites[name] = null;
    }
  }
  return {
    subtype,
    fields,
    resources,
    readSchema: z.object(read) as never,
    createSchema: z.object(create).strict() as never,
    updateSchema: z.object(update).strict() as never,
    readBackWrites,
    shapes: { read, create, update },
  };
}
