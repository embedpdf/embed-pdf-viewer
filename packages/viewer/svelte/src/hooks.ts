/**
 * The functions for components inside `<PDFViewer>`: the `viewer`, and a command as a button
 * needs it. They work in the components you give the viewer, which mount once it's live, inside
 * it. The headless functions of `@embedpdf/svelte` work there too, for any plugin's API and state.
 */
// The viewer for types only, so this module holds no runtime edge to any engine (see
// ./component.svelte).
import type { Viewer } from '@embedpdf/viewer/core';
import { getContext, hasContext, setContext, untrack } from 'svelte';

/**
 * A command as a button needs it, for the active document, as `{ current }`: its `label`, `icon`
 * and `shortcut`, whether it's `enabled`, `active` and `visible`, and `run()`. The headless
 * function, which reads the kernel `<PDFViewer>` gives its children: an id the viewer doesn't
 * have is neither visible nor enabled.
 */
export { useCommand } from '@embedpdf/svelte/commands';

const VIEWER = Symbol('embedpdf.pdf-viewer');

/** For `<PDFViewer>`: give the components inside it the viewer `current()` says is live. */
export function setViewerContext(current: () => Viewer | null): void {
  setContext(VIEWER, current);
}

/**
 * The `viewer`, in a component inside `<PDFViewer>`: `get(name)`, `documents`, `commands`,
 * `watch` and `forDocument`. Your components mount once the viewer is live, so it is always
 * there. Outside the viewer, keep the one `onready` gives you; called there, this throws.
 */
export function usePDFViewer(): Viewer {
  // Untracked: the components inside mount again for a new viewer, so this one never changes.
  const viewer = hasContext(VIEWER) ? untrack(getContext<() => Viewer | null>(VIEWER)) : null;
  if (!viewer) {
    throw new Error(
      '[embedpdf] usePDFViewer() works in a component inside <PDFViewer>. Outside the viewer, ' +
        'keep the viewer its onready gives you.',
    );
  }
  return viewer;
}
