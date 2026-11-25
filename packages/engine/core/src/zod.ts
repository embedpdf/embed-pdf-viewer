/**
 * The part of zod the engine's schemas are built with. Every module that
 * builds or reads a schema imports `* as z` from here, never from `zod`: the
 * names are the ones used, so a bundle leaves the rest of zod out (its
 * messages in every language, its JSON Schema reader and writer), and
 * `object` keeps to a page's Content Security Policy.
 */
import { config, object as zodObject } from 'zod';

/**
 * `z.object`, on a page or in a worker told not to compile what it checks.
 * zod otherwise tries out `new Function` when the first object schema is
 * made, which a strict Content Security Policy reports even though zod
 * catches the failure. Set where objects are made, not by a module of its
 * own: the package has no side effects, so a bundler drops a module nothing
 * is used from. Node has no policy to keep, and checks faster compiled.
 */
export const object = objectWithinPolicy();

function objectWithinPolicy(): typeof zodObject {
  if ('document' in globalThis || 'WorkerGlobalScope' in globalThis) config({ jitless: true });
  return zodObject;
}

export {
  NEVER,
  array,
  boolean,
  coerce,
  date,
  discriminatedUnion,
  enum,
  getDiscriminatedOption,
  lazy,
  literal,
  never,
  null,
  number,
  preprocess,
  record,
  safeParse,
  string,
  tuple,
  union,
  unknown,
} from 'zod';

export type {
  ZodDiscriminatedUnion,
  ZodEnum,
  ZodError,
  ZodObject,
  ZodOptional,
  ZodRawShape,
  ZodType,
  core,
  infer,
} from 'zod';
