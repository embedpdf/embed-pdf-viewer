/**
 * The annotation controller over a real engine document, on the kernel's test
 * context: the records mirror loads from and folds the document's own events,
 * exactly as in the viewer. The interaction hub is not wired; tests drive the
 * pointer verbs directly.
 */
import type { DocumentHandle, PageLayout } from '@embedpdf/engine-core/runtime';
import { createTestContext } from '../../../../core/main/src/testing';

import { createAnnotationController } from '../../../../plugin/annotation/src/controller';
import { initialAnnotationState, type AnnotationState } from '../../../../plugin/annotation/src/model';

export async function annotationShell(doc: DocumentHandle, pages: readonly PageLayout[]) {
  const ctx = createTestContext<AnnotationState>({
    id: 'annotation',
    state: initialAnnotationState(),
    documentId: doc.id,
    pages: pages.map((page) => ({
      ref: page.ref,
      size: page.size,
      crop: page.boxes.crop,
      rotation: page.rotation,
      userUnit: page.userUnit,
      label: page.label,
    })),
    doc,
  });
  const { api } = createAnnotationController(ctx);
  // Start the records mirror (what the kernel does once the plugin is connected).
  const annotation = ctx.connect({ api });
  await annotation.whenSynced();
  return { ctx, annotation };
}
