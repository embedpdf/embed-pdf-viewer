/**
 * The redaction session: whether an apply is running and the last confirmed
 * apply result. Marks are annotations and live on the annotation plane. Every
 * function below is a pure transition; the controller applies them with
 * `ctx.state.update`.
 */
import type { RedactionApplyResult } from '@embedpdf/engine-core';

export interface RedactionModel {
  /** An apply of this session is running at the engine. */
  readonly applying: boolean;
  /** The last confirmed apply result, from this session or another. */
  readonly lastResult: RedactionApplyResult | null;
}

export const initialRedactionModel = (): RedactionModel => ({
  applying: false,
  lastResult: null,
});

export const startApply = (state: RedactionModel): RedactionModel =>
  state.applying ? state : { ...state, applying: true };

export const finishApply = (state: RedactionModel): RedactionModel =>
  state.applying ? { ...state, applying: false } : state;

export const setLastResult = (
  state: RedactionModel,
  result: RedactionApplyResult,
): RedactionModel => (state.lastResult === result ? state : { ...state, lastResult: result });
