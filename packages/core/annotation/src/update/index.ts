/**
 * The pure annotation core: `update(model, message)` returns the next session,
 * the records the message changed, and the engine work to do.
 *
 * The core never stores a record. A transition computes a next model from the
 * one it was given; `update` keeps the session and reports the records that
 * differ as a change set, which the plugin shows until the engine confirms it.
 *
 * Where each message is handled:
 *
 *   edit.ts, edit-commit.ts     pointer editing of existing annotations
 *   marquee.ts                  rubber-band selection
 *   draw*.ts                    pointer drawing of new annotations
 *   text-markup.ts              markup, carets and replace-text over selected text
 *   create.ts                   creation from the API
 *   selection-edits.ts          toolbar edits of the whole selection
 *   text.ts                     free-text typing
 *   session.ts                  the session itself: defaults, rekey, forget
 */
import { annotContentsEditable } from '../flags';
import { expandGroups } from '../group';
import { isSelectable } from '../hit';
import type {
  ChangeSet,
  Effect,
  Message,
  Model,
  ModelAnnotation,
  Session,
  UpdateResult,
} from '../types';
import { createAnnot } from './create';
import { createPointer, finishInkCreate, finishPolyCreate } from './draw';
import { editPointer } from './edit';
import { marqueePointer } from './marquee';
import {
  deleteSelection,
  resetRotation,
  rotateSelection,
  setFlags,
  setProps,
} from './selection-edits';
import { forget, initialSession, rekey, setDefaults } from './session';
import { setRichText, setText } from './text';
import { createCaret, createMarkup, createReplaceText, setMarkupPreview } from './text-markup';

/** The model before any record or gesture: an empty view over the initial session. */
export const initialModel: Model = { ...initialSession, byId: {}, order: [] };

/**
 * Run one message. The session is returned whole; the records are returned
 * as the difference the message made, so the caller decides where they live.
 */
export function update(model: Model, message: Message): UpdateResult {
  const [next, effects] = transition(model, message);
  return { session: sessionOf(next), change: changeBetween(model, next), effects };
}

/** Every session field, checked by the compiler to be exactly the fields of `Session`. */
const SESSION_FIELDS = {
  selected: true,
  hovered: true,
  draft: true,
  preview: true,
  seq: true,
  style: true,
  defaults: true,
  hitMargin: true,
  editing: true,
  snap: true,
} satisfies Record<keyof Session, true>;

const SESSION_KEYS = Object.keys(SESSION_FIELDS) as (keyof Session)[];

const sessionOf = (model: Model): Session => ({
  selected: model.selected,
  hovered: model.hovered,
  draft: model.draft,
  preview: model.preview,
  seq: model.seq,
  style: model.style,
  defaults: model.defaults,
  hitMargin: model.hitMargin,
  editing: model.editing,
  snap: model.snap,
});

/** True when every session field is the same value: a message that changed nothing. */
export const sameSession = (left: Session, right: Session): boolean =>
  SESSION_KEYS.every((key) => Object.is(left[key], right[key]));

/** The change set of a message that changed no record. */
export const EMPTY_CHANGE: ChangeSet = { put: [], drop: [] };

/** The records a transition changed. Cheap when nothing changed: `byId` keeps its identity. */
function changeBetween(before: Model, after: Model): ChangeSet {
  if (before.byId === after.byId) return EMPTY_CHANGE;
  const put: ModelAnnotation[] = [];
  for (const id of after.order) {
    const record = after.byId[id];
    if (record && record !== before.byId[id]) put.push(record);
  }
  const drop = before.order.filter((id) => before.byId[id] && !after.byId[id]);
  return put.length || drop.length ? { put, drop } : EMPTY_CHANGE;
}

function transition(model: Model, message: Message): [Model, Effect[]] {
  switch (message.type) {
    case 'editPointer':
      return editPointer(model, message.phase, message.in);
    case 'marqueePointer':
      return marqueePointer(model, message.phase, message.in);
    case 'createPointer':
      return createPointer(
        model,
        message.phase,
        message.subtype,
        message.in,
        message.preset,
        message.intent,
        message.deferInkCommit,
        message.straightenInk,
        message.clickCreate,
        message.flags,
        message.measure,
        message.capture,
      );
    case 'finishInkDraft':
      return finishInkCreate(model);
    case 'finishCreationDraft':
      return finishPolyCreate(model);
    case 'createCaret':
      return createCaret(model, message.page, message.anchor, message.flags);
    case 'createReplaceText':
      return createReplaceText(model, message.page, message.quads, message.anchor, message.preset);
    case 'createMarkup':
      return createMarkup(
        model,
        message.subtype,
        message.page,
        message.quads,
        message.preset,
        message.flags,
      );
    case 'createAnnot':
      return createAnnot(model, message);
    case 'setMarkupPreview':
      return setMarkupPreview(model, message.subtype, message.quadsByPage, message.preset);
    case 'clearMarkupPreview':
      return model.preview ? [{ ...model, preview: null }, []] : [model, []];
    case 'select': {
      const ids = expandGroups(
        model,
        message.ids.filter((id) => isSelectable(model, id)),
      );
      if (!ids.length) return [model, []];
      const selected = message.add ? [...new Set([...model.selected, ...ids])] : ids;
      return [{ ...model, selected }, []];
    }
    case 'deselect': {
      if (!model.selected.length) return [model, []];
      // With `ids`: drop only those (an engaged Behavior retroactively un-selects
      // its annotations — engaged ⇒ not selectable ⇒ not selected). Without: all.
      if (!message.ids) return [{ ...model, selected: [] }, []];
      const drop = new Set(message.ids);
      const selected = model.selected.filter((id) => !drop.has(id));
      return selected.length === model.selected.length ? [model, []] : [{ ...model, selected }, []];
    }
    case 'setProps':
      return setProps(model, message.patch);
    case 'setFlags':
      return setFlags(model, message.patch, message.ids);
    case 'setDefaults':
      return setDefaults(model, message.subtype, message.patch);
    case 'setSnap':
      return [{ ...model, snap: { ...model.snap, ...message.patch } }, []];
    case 'rotate90':
      return rotateSelection(model, 90);
    case 'resetRotation':
      return resetRotation(model);
    case 'delete':
      return deleteSelection(model);
    case 'cancel':
      return [{ ...model, draft: null }, []];
    case 'rekey':
      return [rekey(model, message.from, message.to), []];
    case 'forget':
      return [forget(model, message.ids), []];
    case 'hover':
      // Pure view-model state; the capability diffs before dispatching, so
      // this fires at enter/leave cadence only.
      return model.hovered === message.id ? [model, []] : [{ ...model, hovered: message.id }, []];
    case 'beginTextEdit':
      // `lockedContents` (or an inert `/F` state) blocks entering text edit —
      // the geometry gates don't apply here: locked-only contents still edit.
      return model.byId[message.id] && annotContentsEditable(model.byId[message.id]!)
        ? [{ ...model, editing: message.id, selected: [message.id], draft: null }, []]
        : [model, []];
    case 'setText':
      return setText(model, message.id, message.text);
    case 'setRichText':
      return setRichText(model, message.id, message.doc);
    case 'endTextEdit':
      return model.editing ? [{ ...model, editing: null }, []] : [model, []];
  }
}

export { initialSession, initialStyle, defaultsFor } from './session';
export { rotateDraftDelta } from './edit';
export { MIN_DRAG } from './draw';
export { annotsInBox } from './marquee';
export { calloutBox, calloutUprightRot } from './draw-callout';
