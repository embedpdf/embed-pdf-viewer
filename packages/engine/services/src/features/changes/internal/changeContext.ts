import {
  EngineError,
  EngineErrorCode,
  type ChangeAuthority,
  type ChangeItem,
  type ChangeItemType,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { valuesEqual } from '../../../shared/valuesEqual';
import type { FontRegistrar } from '../../fonts/FontRegistrar';
import type { ReverseStep } from '../ChangeRecord';

/** What every op and step of a change runs with. */
export interface ChangeContext {
  readonly runtime: PdfRuntimeModule;
  readonly session: DocumentSession;
  readonly fonts?: FontRegistrar;
  /** Who the change acts for: each op and step is checked against it. */
  readonly authority: ChangeAuthority;
  readonly signal: AbortSignal;
  /**
   * Whether the change fills in a field the caller may fill (an undo: puts
   * one back). Then a field a script calculates, or shows or hides, may be
   * written whatever its group: the scripts' outputs travel with their inputs.
   */
  readonly fillsOwnField: () => boolean;
}

/** What running an op or a step did: its item, and the steps that reverse it, in the order they run. */
export interface Done {
  readonly item: ChangeItem<PdfCoordinates>;
  readonly reverse: readonly ReverseStep[];
}

/** An op or step that wrote nothing: an item left alone, and nothing to reverse. */
export function leftAlone(ctx: ChangeContext, type: ChangeItemType): Done {
  return {
    item: {
      type: 'skipped',
      op: type,
      meta: { affectedPages: [], cacheDelta: null, ...ctx.session.writeStamp() },
    },
    reverse: [],
  };
}

/**
 * Refuses the change with `ChangeConflict` when the document doesn't hold what
 * op `opIndex` expects: each field of `expected` must have that value now.
 */
export function assertExpected(
  opIndex: number,
  current: object,
  expected: object | undefined,
): void {
  if (!expected) return;
  const now = current as Record<string, unknown>;
  const fields = Object.entries(expected)
    .filter(([key, value]) => value !== undefined && !valuesEqual(now[key], value))
    .map(([key]) => key);
  if (fields.length > 0) {
    throw new EngineError(
      EngineErrorCode.ChangeConflict,
      `op ${opIndex} expected other values in ${fields.join(', ')}`,
      { details: { opIndex, fields } },
    );
  }
}
