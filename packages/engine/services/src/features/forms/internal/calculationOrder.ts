import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';

/**
 * The form's calculation order (`/AcroForm /CO`): the fields whose calculate
 * scripts run, in the order they run, by object number. A field's calculate
 * script keeps it in the order; the order is a list like a page's
 * annotations, moved by neighbour.
 */

/** The calculation order before a write and as the write left it. */
export interface OrderChange {
  readonly before: readonly number[];
  readonly after: readonly number[];
}

/** The order a loaded form model reads. A slot that names no field is left out. */
export function readCalculationOrder(runtime: PdfRuntimeModule, model: Ptr): number[] {
  const { fn } = runtime;
  const order: number[] = [];
  const count = fn.EPDFForm_CountCalculationOrder(model);
  for (let slot = 0; slot < count; slot++) {
    const fieldIndex = fn.EPDFForm_GetCalculationOrderFieldIndex(model, slot);
    if (fieldIndex < 0) continue;
    const objectNumber = fn.EPDFForm_GetFieldObjNum(model, fieldIndex);
    if (objectNumber > 0 && !order.includes(objectNumber)) order.push(objectNumber);
  }
  return order;
}

/** Write the order; an empty one removes `/CO`. */
export function writeCalculationOrder(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  order: readonly number[],
): void {
  const { fn, mem } = runtime;
  const written = withScratch(mem, Math.max(1, order.length * 4), (buf) => {
    order.forEach((objectNumber, at) => mem.poke(buf, 'i32', objectNumber, at * 4));
    return fn.EPDFForm_SetCalculationOrder(docPtr, buf, order.length);
  });
  if (!written) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'the calculation order could not be written');
  }
}

/** Whether two orders list the same fields in the same order. */
export function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((objectNumber, at) => objectNumber === b[at]);
}

/**
 * The order an undo leaves: `now`, with what a change did (`before` to
 * `after`) taken back where nobody changed it since.
 * - A field the change added leaves.
 * - A field it took out comes back, when it is still a field.
 * - A field it moved goes back, when the field before it is still the one
 *   the change left there.
 *
 * A field that comes or goes back lands right after its nearest earlier
 * neighbour of `before` that is in the order, or at the start. Fields go
 * back lowest first, so a neighbour that moved too is back before them.
 */
export function orderBack(
  now: readonly number[],
  { before, after }: OrderChange,
  isField: (objectNumber: number) => boolean,
): number[] {
  const added = after.filter((objectNumber) => !before.includes(objectNumber));
  let order = now.filter((objectNumber) => !added.includes(objectNumber));
  for (const objectNumber of before) {
    const takenOut = !after.includes(objectNumber);
    if (takenOut) {
      if (order.includes(objectNumber) || !isField(objectNumber)) continue;
    } else {
      const moved = previous(before, objectNumber) !== previous(after, objectNumber);
      if (!moved || previous(now, objectNumber) !== previous(after, objectNumber)) continue;
      order = order.filter((other) => other !== objectNumber);
    }
    const at = before.indexOf(objectNumber);
    const neighbour = before
      .slice(0, at)
      .reverse()
      .find((other) => order.includes(other));
    const index = neighbour === undefined ? 0 : order.indexOf(neighbour) + 1;
    order = [...order.slice(0, index), objectNumber, ...order.slice(index)];
  }
  return order;
}

/** The field right before `objectNumber` in `order`: `null` at the start, `undefined` when absent. */
function previous(order: readonly number[], objectNumber: number): number | null | undefined {
  const at = order.indexOf(objectNumber);
  if (at < 0) return undefined;
  return at === 0 ? null : order[at - 1]!;
}
