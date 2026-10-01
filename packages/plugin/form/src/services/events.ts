/** The form plugin's events. Fact events fire from the fields mirror; see `sync/fields.ts`. */
import type {
  FormFieldCreatedEvent,
  FormFieldDeletedEvent,
  FormFieldUpdatedEvent,
  FormResyncedEvent,
  FormValidationRejectedEvent,
  FormValueChangedEvent,
} from '../contract';
import type { FormContext } from './context';

export function createEvents(ctx: FormContext) {
  return {
    valueChanged: ctx.events.source<FormValueChangedEvent>(),
    fieldCreated: ctx.events.source<FormFieldCreatedEvent>(),
    fieldUpdated: ctx.events.source<FormFieldUpdatedEvent>(),
    fieldDeleted: ctx.events.source<FormFieldDeletedEvent>(),
    validationRejected: ctx.events.source<FormValidationRejectedEvent>(),
    resynced: ctx.events.source<FormResyncedEvent>(),
  };
}
export type FormEvents = ReturnType<typeof createEvents>;
