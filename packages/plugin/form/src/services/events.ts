/** The six confirmed-change hooks; disposed with the plugin. */
import { createEventHook } from '@embedpdf/core';

import type {
  FormFieldChangedEvent,
  FormResyncedEvent,
  FormValidationRejectedEvent,
  FormValueChangedEvent,
} from '../contract';
import type { FormContext } from './context';

export function createEvents(ctx: FormContext) {
  const reportListener = (error: unknown) => console.error('[form] event listener failed:', error);
  const valueChanged = createEventHook<FormValueChangedEvent>(reportListener);
  const fieldCreated = createEventHook<FormFieldChangedEvent>(reportListener);
  const fieldUpdated = createEventHook<FormFieldChangedEvent>(reportListener);
  const fieldDeleted = createEventHook<FormFieldChangedEvent>(reportListener);
  const validationRejected = createEventHook<FormValidationRejectedEvent>(reportListener);
  const resynced = createEventHook<FormResyncedEvent>(reportListener);
  ctx.cleanup(() => {
    for (const hook of [
      valueChanged,
      fieldCreated,
      fieldUpdated,
      fieldDeleted,
      validationRejected,
      resynced,
    ])
      hook.dispose();
  });
  return { valueChanged, fieldCreated, fieldUpdated, fieldDeleted, validationRejected, resynced };
}
export type FormEvents = ReturnType<typeof createEvents>;
