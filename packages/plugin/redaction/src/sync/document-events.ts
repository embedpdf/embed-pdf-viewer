/**
 * Every confirmed apply, from this session or another, arrives as one
 * `redaction.applied` document event: the only place `lastResult` changes and
 * `onApplied` fires. Annotation state and raster invalidation are handled by
 * their own plugins. Marks are annotations, so the pending view changes
 * whenever a `redact` annotation does.
 */
import { originOf } from '@embedpdf/core';
import type { AnnotationChangedEvent } from '@embedpdf/plugin-annotation/contract';

import { setLastResult } from '../model';
import type { RedactionContext, RedactionServices } from '../services';

export function subscribeChanges(
  ctx: RedactionContext,
  { events, siblings }: Pick<RedactionServices, 'events' | 'siblings'>,
): void {
  const { applied, pendingChanged } = events;
  const { annotation } = siblings;

  ctx.listen(ctx.doc.events, (event) => {
    if (event.type !== 'redaction.applied') return;
    const { type: _type, origin: _origin, ...result } = event;
    ctx.state.update(setLastResult, result);
    applied.emit({ result, origin: originOf(event) });
  });

  const markChanged = (event: AnnotationChangedEvent) => {
    if (event.subtype === 'redact') pendingChanged.emit({ pages: [event.page] });
  };
  ctx.listen(annotation.onCreated, markChanged);
  ctx.listen(annotation.onUpdated, markChanged);
  // A deleted record has no subtype any more; the page's list changed either way.
  ctx.listen(annotation.onDeleted, (event) => pendingChanged.emit({ pages: [event.page] }));
}
