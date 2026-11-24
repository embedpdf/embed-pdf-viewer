/**
 * The form plugin's events. Fact events fire from the fields mirror; see `sync/fields.ts`. The
 * design group's event is derived here, from each committed state change, and the groups' the
 * same way where the groups are worked out (`services/groups.ts`).
 */
import type {
  FormDesignGroupChangedEvent,
  FormFieldCreatedEvent,
  FormFieldDeletedEvent,
  FormFieldUpdatedEvent,
  FormFocusChangedEvent,
  FormGroupsChangedEvent,
  FormResyncedEvent,
  FormValidationRejectedEvent,
  FormValueChangedEvent,
} from '../contract';
import type { FormContext } from './context';

export function createEvents(ctx: FormContext) {
  const events = {
    valueChanged: ctx.events.source<FormValueChangedEvent>(),
    fieldCreated: ctx.events.source<FormFieldCreatedEvent>(),
    fieldUpdated: ctx.events.source<FormFieldUpdatedEvent>(),
    fieldDeleted: ctx.events.source<FormFieldDeletedEvent>(),
    validationRejected: ctx.events.source<FormValidationRejectedEvent>(),
    resynced: ctx.events.source<FormResyncedEvent>(),
    focusChanged: ctx.events.source<FormFocusChangedEvent>(),
    designGroupChanged: ctx.events.source<FormDesignGroupChangedEvent>(),
    groupsChanged: ctx.events.source<FormGroupsChangedEvent>(),
  };

  ctx.state.onChange(({ previous, next }) => {
    if (previous.designGroup !== next.designGroup) {
      events.designGroupChanged.emit({ groupId: next.designGroup });
    }
  });

  return events;
}
export type FormEvents = ReturnType<typeof createEvents>;
