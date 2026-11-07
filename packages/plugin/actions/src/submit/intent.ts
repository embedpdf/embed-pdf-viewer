/** The one normalized submit intent, from either source (an action node's
 *  payload or a script `doc.submitForm()` effect), and the engine request
 *  shape the document's home receives. Pure. */
import type { ScriptUiEffect } from '@embedpdf/core-acrojs';
import type {
  FormSubmissionRequest,
  IsoDateTime,
  SubmitFormPayload,
} from '@embedpdf/engine-core/runtime';

import type { ActionSubmitRequest, SubmitIntent } from '../contract';

export const intentOfPayload = (payload: SubmitFormPayload): SubmitIntent => ({
  url: payload.url,
  fields: payload.fields,
  exclude: payload.exclude,
  includeNoValueFields: payload.includeNoValueFields,
  format: payload.format,
  method: payload.method,
  ...(payload.charSet === undefined ? {} : { charSet: payload.charSet }),
});

export const toFormSubmissionRequest = (
  request: ActionSubmitRequest,
  sentAt: IsoDateTime,
): FormSubmissionRequest => ({
  entries: request.entries,
  intent: {
    url: request.url,
    format: request.format,
    method: request.method,
    ...(request.charSet === undefined ? {} : { charSet: request.charSet }),
  },
  origin: request.origin,
  sentAt,
});

/** Script `doc.submitForm(...)` → the one normalized intent. Script field
 *  names are include-mode by definition (Acrobat's aFields). */
export const intentOfSubmitEffect = (
  effect: Extract<ScriptUiEffect, { type: 'submitForm' }>,
): SubmitIntent => {
  const format = effect.format ?? 'fdf';
  return {
    url: effect.url,
    fields: effect.fieldNames?.map((name) => ({ kind: 'name' as const, name })) ?? null,
    exclude: false,
    includeNoValueFields: effect.includeEmpty,
    format,
    method: effect.method ?? 'post',
  };
};
