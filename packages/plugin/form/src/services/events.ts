/** The form plugin's events. Fact events fire from the fields mirror; see `sync/fields.ts`. */
import type {
  FormFieldChangedEvent,
  FormResyncedEvent,
  FormValidationRejectedEvent,
  FormValueChangedEvent,
} from '../contract';
import type { FormContext } from './context';

export function createEvents(ctx: FormContext) {
  return {
    valueChanged: ctx.events.source<FormValueChangedEvent>(),
    fieldCreated: ctx.events.source<FormFieldChangedEvent>(),
    fieldUpdated: ctx.events.source<FormFieldChangedEvent>(),
    fieldDeleted: ctx.events.source<FormFieldChangedEvent>(),
    validationRejected: ctx.events.source<FormValidationRejectedEvent>(),
    resynced: ctx.events.source<FormResyncedEvent>(),
  };
}
export type FormEvents = ReturnType<typeof createEvents>;
