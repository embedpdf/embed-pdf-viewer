/** The sibling plugins: annotation (host lens) and the interaction hub. */
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import type { MeasurementContext } from './context';

export function resolveSiblings(ctx: MeasurementContext) {
  return { annotation: ctx.get(AnnotationToken), interaction: ctx.get(InteractionToken) };
}
export type MeasurementSiblings = ReturnType<typeof resolveSiblings>;
