import { isDeepStrictEqual } from 'node:util';
import { afterAll } from 'vitest';
import { readingProblems, withUnknownFields } from '@embedpdf/engine-core/conformance';
import { EngineErrorSchema } from '@embedpdf/engine-core/wire';

/**
 * Every JSON response this suite's client reads is read a second time with
 * an unknown field added to every object in it, nested ones included: what a
 * newer server could send (docs/conventions/api-evolution.md, "Reading
 * tolerantly"). The client must read both the same, and the schema it reads
 * with must name how each set in it is read. A test file fails when one of
 * its responses doesn't.
 *
 * A body counts as a response when `Response.json()` returned it, and the
 * schema that reads it is the one a top-level `parse` or `safeParse` hands it
 * to. zod binds those two to each schema, so the hook sits on `_parseSync`,
 * which they call, on the prototype the engine's own schemas inherit it from:
 * the engine's copy of zod.
 */
type Schema = Parameters<typeof readingProblems>[0] & {
  safeParse(data: unknown): { success: true; data: unknown } | { success: false; error: ZodError };
};
interface ZodError {
  issues: Array<{ path: Array<string | number>; message: string }>;
}
/** What `_parseSync` is handed: a top-level parse's context has no parent. */
interface ParseInput {
  data: unknown;
  path: unknown[];
  parent: { parent: unknown } | null;
}
type ParseSync = (this: Schema, input: ParseInput) => { status: string; value?: unknown };

/** The prototype that holds `_parseSync` for every schema the engine reads with. */
function schemaPrototype(): { _parseSync: ParseSync } {
  let prototype: object | null = Object.getPrototypeOf(EngineErrorSchema);
  while (prototype && !Object.prototype.hasOwnProperty.call(prototype, '_parseSync')) {
    prototype = Object.getPrototypeOf(prototype);
  }
  if (!prototype) throw new Error('no _parseSync on the engine schemas to check responses with');
  return prototype as { _parseSync: ParseSync };
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

  const prototype = schemaPrototype();
  const parseSync = prototype._parseSync;
  prototype._parseSync = function (this: Schema, input: ParseInput) {
    const result = parseSync.call(this, input);
    const { data } = input;
    const topLevel = input.parent !== null && input.parent.parent === null;
    const path = topLevel && typeof data === 'object' && data !== null && check.responses.get(data);
    if (!path || result.status !== 'valid') return result;
    check.responses.delete(data as object);

    let problems = problemsOf.get(this._def);
    if (!problems) {
      problems = readingProblems(this, 'response');
      problemsOf.set(this._def, problems);
    }
    for (const problem of problems) check.problems.add(`${path}: ${problem}`);

    const again = this.safeParse(withUnknownFields(this, data));
    if (!again.success) {
      const issue = again.error.issues[0];
      check.problems.add(
        `${path}: fails with an unknown field at ${issue?.path.join('.') || 'the top'}: ${issue?.message}`,
      );
    } else if (!isDeepStrictEqual(again.data, result.value)) {
      check.problems.add(`${path}: reads differently with an unknown field`);
    }
    return result;
  };

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
