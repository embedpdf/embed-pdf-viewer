/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { AnnotationCapability } from './contract';

export const AnnotationToken = createCapabilityToken<AnnotationCapability>('annotation', {
  hint: `add annotationPlugin() from '@embedpdf/plugin-annotation' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    refresh: true,
    create: true,
    createFromSelection: true,
    update: true,
    delete: true,
    move: true,
    export: true,
    import: true,
    downloadResource: true,
    'links.set': true,
    'links.clear': true,
    'selection.update': true,
    'selection.updateLink': true,
    'selection.delete': true,
    'selection.rotateBy': true,
    'selection.resetRotation': true,
    'selection.group': true,
    'selection.ungroup': true,
    'draft.finish': true,
    'text.end': true,
    'text.toggleFormat': true,
    'stamps.arm': true,
    'stamps.place': true,
    'comments.reply': true,
    'comments.setText': true,
    'comments.setStatus': true,
    'comments.setMarked': true,
    'comments.delete': true,
    'comments.deleteThread': true,
  },
});
