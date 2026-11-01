/**
 * How `<PDFViewer>` treats its config: the live keys it hands on to the running viewer, and the
 * rest, read once, with a warning in development when one changes.
 */
import type { LiveConfigKey } from '@embedpdf/viewer/core';

/** The keys the element follows while it runs: `<PDFViewer>` hands their changes on. */
const LIVE_KEYS: Readonly<Record<LiveConfigKey, true>> = {
  src: true,
  theme: true,
  locale: true,
  disable: true,
  readOnly: true,
  fetch: true,
};

/** The live keys of `config`, as the element's properties of the same names take them. */
export function liveConfigOf(config: Partial<Record<LiveConfigKey, unknown>>) {
  return {
    src: config.src,
    theme: config.theme,
    locale: config.locale,
    disable: config.disable,
    readOnly: config.readOnly,
    fetch: config.fetch,
  };
}

/**
 * The first key, other than the live ones, whose value isn't the one the viewer started with, or
 * null. By identity: Svelte keeps a prop's value until what it's made from changes.
 */
export function changedReadOnceKey(started: object, current: object): string | null {
  const before = started as Readonly<Record<string, unknown>>;
  const after = current as Readonly<Record<string, unknown>>;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key in LIVE_KEYS) continue;
    if (!Object.is(before[key], after[key])) return key;
  }
  return null;
}

/** What development says when a read-once key changes. */
export const readOnceWarning = (key: string): string =>
  `[embedpdf] <PDFViewer>: \`${key}\` is read once, when the viewer starts, so the change is ` +
  'ignored. Pass a stable value (module scope, or $state that keeps it), or put the viewer in a ' +
  '{#key} block to mount a new one with it.';
