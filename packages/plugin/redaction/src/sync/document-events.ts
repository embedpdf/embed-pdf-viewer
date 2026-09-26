/**
 * A REMOTE collaborator's apply arrives only as a document event (own applies
 * flow through the apply area). Annotation state and raster invalidation are
 * handled by their own planes; here it is surfaced. Marks are annotations, so
 * the pending view changes whenever a `redact` annotation does.
 */
import { originOf } from '@embedpdf/core';
import type { AnnotationChangedEvent } from '@embedpdf/plugin-annotation/contract';

import type { RedactionContext, RedactionServices } from '../services';

export function subscribeChanges(
  ctx: RedactionContext,
  { events, siblings }: Pick<RedactionServices, 'events' | 'siblings'>,
): void {
  const { applied, pendingChanged } = events;
  const { annotation } = siblings;

  const off = ctx.doc?.events?.subscribe((event) => {
    if (event.type !== 'redaction.applied') return;
    if (event.origin.kind !== 'remote') return;
    ctx.dispatch({ type: 'APPLY_FINISHED', result: event });
    applied.emit({ result: event, origin: originOf(event) });
  });
  if (off) ctx.cleanup(off);

  const mark = (event: AnnotationChangedEvent) => {
    if (event.subtype === 'redact') pendingChanged.emit({ pages: [event.page] });
  };
  ctx.cleanup(annotation.onCreated(mark));
  ctx.cleanup(annotation.onUpdated(mark));
  ctx.cleanup(
    annotation.onDeleted((event) => {
      // A deleted record has no subtype any more; the page's list changed either way.
      pendingChanged.emit({ pages: [event.page] });
    }),
  );
}
