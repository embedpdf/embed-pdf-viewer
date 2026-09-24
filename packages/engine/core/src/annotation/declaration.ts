import { z } from 'zod';

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
 *   a read DTO can be passed straight back.
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
    writes: (schema) => createField(read, schema, traits),
  };
}

export interface OwnerTraits<Owner extends FieldOwner, Required extends boolean> {
  owner: Owner;
  readNullable: false;
  writeNullable: false;
  required: Required;
  createOnly: false;
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
  [Name in NamesWhere<Fields, { owner: 'data' }>]?: WriteValue<Fields[Name]>;
} & {
  [Name in AcceptedNames<Fields>]?: ReadValue<Fields[Name]>;
};

// ── kinds ──

/** A role in which bytes travel beside the data: `create(data, resources)`. */
export type ResourceRole = 'appearance' | 'file';

export type KindResources = { readonly [Role in ResourceRole]?: 'required' | 'optional' };

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
  for (const [name, spec] of Object.entries(fields)) {
    const { owner, readNullable, writeNullable, required } = spec.traits;
    read[name] = readNullable ? spec.read.nullable() : spec.read;
    if (owner === 'data') {
      const write = writeNullable ? spec.write.nullable() : spec.write;
      create[name] = required ? write : write.optional();
      update[name] = write.optional();
    } else {
      // Accepted so a read DTO can be sent back; the engine decides what happens to it.
      create[name] = z.unknown().optional();
      update[name] = z.unknown().optional();
    }
  }
  return {
    subtype,
    fields,
    resources,
    readSchema: z.object(read) as never,
    createSchema: z.object(create).strict() as never,
    updateSchema: z.object(update).strict() as never,
    shapes: { read, create, update },
  };
}
