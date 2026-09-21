/** Result shaping for the scripting transaction: errors, budgets, page numbers, statuses. */
import type { DocumentMeta } from '@embedpdf/core';
import type { ScriptExecutionError } from '@embedpdf/core-acrojs';
import type { FormEffectsResult, FormFieldDTO } from '@embedpdf/engine-core/runtime';

import type { FormCommitResult } from '../contract';

export function scriptError(message: string): ScriptExecutionError {
  return { kind: 'invalid-output', message };
}

export function utf8Length(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

export function pageNumberFor(meta: DocumentMeta | null, field: FormFieldDTO): number {
  const placed = field.widgets.find((widget) => widget.page !== null)?.page;
  if (!meta || !placed) return 0;
  const index = meta.pages.findIndex(
    (page) => page.ref.pageObjectNumber === placed.pageObjectNumber,
  );
  return Math.max(0, index);
}

export function statusFromEffects(result: FormEffectsResult): FormCommitResult['status'] {
  if (result.results.some(({ status }) => status === 'failed' || status === 'skipped')) {
    return 'failed';
  }
  if (result.results.some(({ status }) => status === 'rejected')) return 'failed';
  return result.results.some(({ status }) => status === 'applied') ? 'applied' : 'unchanged';
}
