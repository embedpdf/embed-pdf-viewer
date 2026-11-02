/**
 * The last-resort program's bytes, for an engine to register: a module of its
 * own that reaches nothing else, so a worker bundle that registers the last
 * resort carries none of the standard faces.
 */
import { decodeBase64 } from './base64';
import { LAST_RESORT_PROGRAM } from './last-resort.generated';

/** The last-resort program: a box for every code point (`LAST_RESORT_HASH`). */
export function lastResortFontBytes(): Uint8Array {
  return decodeBase64(LAST_RESORT_PROGRAM);
}
