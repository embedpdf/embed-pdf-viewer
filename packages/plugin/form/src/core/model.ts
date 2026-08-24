/**
 * The pure heart of the form plugin — no DOM, no engine, no kernel imports.
 * Same discipline as `annotation-core`, folded in as a directory because the
 * model is small and has no consumer besides this plugin.
 *
 * The model mirrors ENGINE truth plus transient write status. Keystroke
 * drafts deliberately live in the framework controls (a focused `<input>` is
 * already the draft store); the model only learns about a value when it is
 * committed. That keeps typing synchronous and the model identical across
 * frameworks.
 */
import type { FormFieldDTO, FormSnapshot } from '@embedpdf/engine-core/runtime';

/** A content-space box (top-left origin, y-down, PDF points). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Stable client key for a field: object number when durable, else FQN. */
export type FieldKey = string;

export const fieldKeyOf = (field: { fieldObjectNumber: number; name: string }): FieldKey =>
  field.fieldObjectNumber > 0 ? `obj:${field.fieldObjectNumber}` : `fqn:${field.name}`;

export interface Model {
  /** Engine truth; replaced wholesale on refresh, patched on write-backs. */
  snapshot: FormSnapshot | null;
  /** fieldKey → index into snapshot.fields. */
  byKey: Record<FieldKey, number>;
  /** annotObjectNumber → index into snapshot.fields (widget → field join). */
  byWidget: Record<number, number>;
  /** Fields with an in-flight engine write (disables their controls). */
  writing: Record<FieldKey, true>;
  /**
   * Widget geometry per page: annotObjectNumber → content-space box. Fed by
   * the shell from the WIDGET plane (one annotations read per page); value
   * writes never move widgets, so this survives snapshot refreshes and is
   * only cleared on structural form events.
   */
  geom: Record<number, Record<number, Box> | undefined>;
  /** Bumped on every change — cheap equality for memoized projections. */
  seq: number;
}

export const initialModel = (): Model => ({
  snapshot: null,
  byKey: {},
  byWidget: {},
  writing: {},
  geom: {},
  seq: 0,
});

export type Msg =
  | { t: 'snapshot'; snapshot: FormSnapshot }
  | { t: 'writeStart'; key: FieldKey }
  | { t: 'writeDone'; key: FieldKey; field: FormFieldDTO }
  | { t: 'writeFailed'; key: FieldKey }
  | { t: 'pageGeom'; pageObjectNumber: number; boxes: Record<number, Box> }
  | { t: 'clearGeom'; pageObjectNumber?: number };

function index(snapshot: FormSnapshot): Pick<Model, 'byKey' | 'byWidget'> {
  const byKey: Record<FieldKey, number> = {};
  const byWidget: Record<number, number> = {};
  snapshot.fields.forEach((field, i) => {
    byKey[fieldKeyOf(field)] = i;
    for (const w of field.widgets) {
      if (w.annotObjectNumber > 0) byWidget[w.annotObjectNumber] = i;
    }
  });
  return { byKey, byWidget };
}

export function update(model: Model, msg: Msg): Model {
  switch (msg.t) {
    case 'snapshot':
      return {
        ...model,
        snapshot: msg.snapshot,
        ...index(msg.snapshot),
        writing: {},
        seq: model.seq + 1,
      };
    case 'writeStart':
      return { ...model, writing: { ...model.writing, [msg.key]: true }, seq: model.seq + 1 };
    case 'writeDone': {
      if (!model.snapshot) return model;
      const i = model.byKey[msg.key];
      if (i === undefined) return model;
      const fields = model.snapshot.fields.slice();
      fields[i] = msg.field;
      const { [msg.key]: _done, ...writing } = model.writing;
      const snapshot = { ...model.snapshot, fields };
      return { ...model, snapshot, ...index(snapshot), writing, seq: model.seq + 1 };
    }
    case 'writeFailed': {
      const { [msg.key]: _failed, ...writing } = model.writing;
      return { ...model, writing, seq: model.seq + 1 };
    }
    case 'pageGeom':
      return {
        ...model,
        geom: { ...model.geom, [msg.pageObjectNumber]: msg.boxes },
        seq: model.seq + 1,
      };
    case 'clearGeom': {
      if (msg.pageObjectNumber === undefined) {
        return { ...model, geom: {}, seq: model.seq + 1 };
      }
      const geom = { ...model.geom };
      delete geom[msg.pageObjectNumber];
      return { ...model, geom, seq: model.seq + 1 };
    }
  }
}

export const fieldByKey = (model: Model, key: FieldKey): FormFieldDTO | null => {
  const i = model.byKey[key];
  return i === undefined ? null : (model.snapshot?.fields[i] ?? null);
};

export const fieldForWidget = (model: Model, annotObjectNumber: number): FormFieldDTO | null => {
  const i = model.byWidget[annotObjectNumber];
  return i === undefined ? null : (model.snapshot?.fields[i] ?? null);
};
