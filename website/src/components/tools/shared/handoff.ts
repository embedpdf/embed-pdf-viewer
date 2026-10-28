'use client';

/** A file one tool hands to the next, so the user doesn't pick it again. */
export interface HandedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** A file that had a password still has it after a save. */
  readonly password?: string;
}

/**
 * Held in memory, not in storage: files can be large and should stay on this page. It lasts a
 * client-side navigation to the next tool, which is all it's for.
 */
let handed: HandedFile | null = null;

export function handOff(file: HandedFile): void {
  handed = file;
}

/** The file handed over, if any, without taking it: React may render a page twice. */
export function peekHandedFile(): HandedFile | null {
  return handed;
}

/** Done with `file`: the next visit starts empty. */
export function clearHandedFile(file: HandedFile): void {
  if (handed === file) handed = null;
}
