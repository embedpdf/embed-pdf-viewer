import { isDeepStrictEqual } from 'node:util';
import { afterAll } from 'vitest';
import { readingProblems, withUnknownFields } from '@embedpdf/engine-core/conformance';
import * as wire from '@embedpdf/engine-core/wire';

/**
 * Every JSON response this suite's client reads is read a second time with
 * an unknown field added to every object in it, nested ones included: what a
 * newer server could send (docs/conventions/api-evolution.md, "Reading
 * tolerantly"). The client must read both the same, and the schema it reads
 * with must name how each set in it is read. A test file fails when one of
 * its responses doesn't.
 *
 * A body counts as a response when `Response.json()` returned it, and the
 * schema that reads it is the one a `parse` or `safeParse` hands it to. zod
 * puts those two on the prototype of each kind of schema, so the hook sits on
 * the prototypes the engine's own schemas have: the engine's copy of zod.
 */
type Schema = Parameters<typeof readingProblems>[0] & {
  safeParse(data: unknown, ...rest: unknown[]): SafeParsed;
  parse(data: unknown, ...rest: unknown[]): unknown;
};
type SafeParsed =
  | { success: true; data: unknown }
  | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };

/** The prototypes that hold `safeParse` and `parse` for the schemas the engine reads with. */
function schemaPrototypes(): Schema[] {
  const prototypes = new Set<object>();
  for (const exported of Object.values(wire)) {
    if (typeof exported !== 'object' || exported === null || !('safeParse' in exported)) continue;
    let prototype: object | null = Object.getPrototypeOf(exported);
    while (prototype && !Object.prototype.hasOwnProperty.call(prototype, 'safeParse')) {
      prototype = Object.getPrototypeOf(prototype);
    }
    if (prototype) prototypes.add(prototype);
  }
  if (prototypes.size === 0) {
    throw new Error('no safeParse on the engine schemas to check responses with');
  }
  return [...prototypes] as Schema[];
}

type Method<Name extends 'safeParse' | 'parse'> = (
  this: Schema,
  ...args: Parameters<Schema[Name]>
) => ReturnType<Schema[Name]>;

/** A prototype's method. zod keeps it behind a getter that binds it to whoever reads it. */
function methodOf<Name extends 'safeParse' | 'parse'>(prototype: Schema, name: Name): Method<Name> {
  return Object.getOwnPropertyDescriptor(prototype, name)!.get!.call(undefined) as Method<Name>;
}

function replaceMethod<Name extends 'safeParse' | 'parse'>(
  prototype: Schema,
  name: Name,
  method: Method<Name>,
): void {
  Object.defineProperty(prototype, name, { configurable: true, writable: true, value: method });
}

interface ReadingCheck {
  readonly responses: WeakMap<object, string>;
  readonly problems: Set<string>;
}

const STATE = Symbol.for('cloudpdf.engine.test.readsTolerantly');

function install(): ReadingCheck {
  const check: ReadingCheck = { responses: new WeakMap(), problems: new Set() };
  const problemsOf = new WeakMap<object, string[]>();

  const json = Response.prototype.json;
  Response.prototype.json = async function (this: Response) {
    const body: unknown = await json.call(this);
    if (typeof body === 'object' && body !== null) {
      check.responses.set(body, `${new URL(this.url || 'http://local/').pathname}`);
    }
    return body;
  };

  /** Reads `data`, which `schema` just read as `value`, once more with unknown fields. */
  const readAgain = (schema: Schema, data: unknown, value: unknown): void => {
    const path = typeof data === 'object' && data !== null && check.responses.get(data);
    if (!path) return;
    check.responses.delete(data);

    let problems = problemsOf.get(schema);
    if (!problems) {
      problems = readingProblems(schema, 'response');
      problemsOf.set(schema, problems);
    }
    for (const problem of problems) check.problems.add(`${path}: ${problem}`);

    const again = schema.safeParse(withUnknownFields(schema, data));
    if (!again.success) {
      const issue = again.error.issues[0];
      const at = issue?.path.map(String).join('.') || 'the top';
      check.problems.add(`${path}: fails with an unknown field at ${at}: ${issue?.message}`);
    } else if (!isDeepStrictEqual(again.data, value)) {
      check.problems.add(`${path}: reads differently with an unknown field`);
    }
  };

  for (const prototype of schemaPrototypes()) {
    const safeParse = methodOf(prototype, 'safeParse');
    replaceMethod(prototype, 'safeParse', function (data, ...rest) {
      const result = safeParse.call(this, data, ...rest);
      if (result.success) readAgain(this, data, result.data);
      return result;
    });
    const parse = methodOf(prototype, 'parse');
    replaceMethod(prototype, 'parse', function (data, ...rest) {
      const value = parse.call(this, data, ...rest);
      readAgain(this, data, value);
      return value;
    });
  }

  return check;
}

const holder = globalThis as unknown as Record<symbol, ReadingCheck | undefined>;
const check = (holder[STATE] ??= install());

afterAll(() => {
  const problems = [...check.problems];
  check.problems.clear();
  if (problems.length > 0) {
    throw new Error(`responses that don't read tolerantly:\n${problems.join('\n')}`);
  }
});
