'use client';
/**
 * The hooks for components inside <PDFViewer>: the `viewer`, and a command as a button needs it.
 * They work in the components you give the viewer, which mount once it's live, inside it. The
 * headless hooks of `@embedpdf/react` work there too, for any plugin's API and state.
 */
// Types only, so this module holds no runtime edge to any engine (see ./component).
import type { Viewer } from '@embedpdf/viewer/core';
import { createContext, useContext } from 'react';

/**
 * A command as a button needs it, for the active document: its `label`, `icon` and `shortcut`,
 * whether it's `enabled`, `active` and `visible`, and `run()`. The headless hook, which reads the
 * kernel <PDFViewer> gives its children: an id the viewer doesn't have is neither visible nor
 * enabled.
 */
export { useCommand } from '@embedpdf/react/commands';

/** The `viewer` the components inside a <PDFViewer> belong to. */
export const ViewerContext = createContext<Viewer | null>(null);

/**
 * The `viewer`, in a component inside <PDFViewer>: `get(name)`, `documents`, `commands`,
 * `watch` and `forDocument`. Your components mount once the viewer is live, so it is always
 * there. Outside the viewer, keep the one `onReady` gives you; called there, this throws.
 */
export function usePDFViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) {
    throw new Error(
      '[embedpdf] usePDFViewer() works in a component inside <PDFViewer>. Outside the viewer, ' +
        'keep the viewer its onReady gives you.',
    );
  }
  return viewer;
}
