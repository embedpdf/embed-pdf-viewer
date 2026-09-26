/** The one write door to the model: `apply(msg)` runs the pure core update and
 *  dispatches the result. Everything else here is a read of the slice. */
import type { ResourceStatus } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import { update, type FieldKey, type Model, type Msg } from '../core/model';
import type { FormContext } from './context';

export function createStore(ctx: FormContext) {
  const model = (): Model => ctx.getState().model;
  const keyOf = (ref: FormFieldRef): FieldKey =>
    ref.kind === 'objectNumber' ? `obj:${ref.fieldObjectNumber}` : `fqn:${ref.name}`;
  const setStatus = (status: ResourceStatus): void => {
    if (ctx.getState().status !== status) ctx.dispatch({ type: 'SET_STATUS', status });
  };
  const apply = (msg: Msg): void => {
    ctx.dispatch({ type: 'SET_MODEL', model: update(model(), msg) });
  };
  /** Drop every page's cached widget geometry (a structural change landed). */
  const clearGeom = (): void => {
    apply({ t: 'clearGeom' });
  };
  return { model, apply, setStatus, keyOf, clearGeom };
}
export type FormStore = ReturnType<typeof createStore>;
