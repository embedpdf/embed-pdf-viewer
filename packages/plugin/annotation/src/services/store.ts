/**
 * The store: the two doors every change goes through, and one path behind them.
 *
 *   commit(message)                       a gesture or a selection verb
 *     → update(model, message)            the core: next session, change set, effects
 *     → intents.begin(result)             the change shows at once (state: session + pending)
 *     → effect runners                    each effect becomes an engine write
 *     → intents.run(writes)               the writes run; their entries settle when they do
 *
 *   apply(changes)                        a change stated in code (the API, comments, links…)
 *     → each change checked by the engine's own rules and shown the same way
 *     → the registered writer             each change becomes its engine write
 *     → intents.run(writes)               settled like a gesture's
 *
 * The model it hands out is the view's (read/view.ts): confirmed records with
 * the pending changes on top, composed with the session.
 */
import { PluginError, toPluginError } from '@embedpdf/core';
import {
  creationDraftAnchor,
  drawnAfter,
  type Effect,
  fromDTO,
  type Id,
  type Message,
  type Model,
  type ModelAnnotation,
  refOf,
  sourceOfNew,
  update,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  annotationOfDraft,
  applyAnnotationPatch,
  generateUuid,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationResources,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { changedFields, type RecordChange } from '../model';
import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';
import type { IntentOutcome, Intents, IntentWrite } from './intents';
import type { View } from '../read/view';

/**
 * Turns one kind of effect into the engine write it asks for, reading the
 * records it names from `model` (which already shows the change). Registered
 * by the area that owns the kind. Returns nothing when there is nothing to write.
 */
export type EffectRunner<K extends Effect['type']> = (
  effect: Extract<Effect, { type: K }>,
  model: Model,
) => IntentWrite | void;

/** What committing a message started. */
export interface Commit {
  readonly effects: readonly Effect[];
  /** Settles when every engine write the message started has settled. Never rejects. */
  readonly written: Promise<IntentOutcome>;
}

/**
 * A change stated in code, in the engine's own terms. A create names its
 * annotation (the draft's `nm`, else a fresh one), and the record is keyed by
 * that name until the engine confirms it. A patch is written as given.
 */
export type StoreChange =
  | {
      readonly type: 'create';
      readonly page: PageRef;
      readonly draft: AnnotationDraft;
      readonly resources?: AnnotationResources;
    }
  | {
      readonly type: 'update';
      readonly ref: AnnotationRef;
      readonly patch: AnnotationPatch;
      readonly resources?: AnnotationResources;
    }
  | { readonly type: 'delete'; readonly ref: AnnotationRef };

/** What applying stated changes started: the record each change names, in order. */
export interface Applied {
  readonly ids: readonly Id[];
  /** Settles when every engine write has settled. Never rejects. */
  readonly written: Promise<IntentOutcome>;
}

/**
 * Turns one stated change into its engine write, for the record `id` it
 * names. A create's draft carries its name by now. Registered by the write area.
 */
export type ApplyWriter = (change: StoreChange, id: Id) => IntentWrite;

export interface AnnotationStore {
  /** The current model: what every read and gesture works on. */
  model(): Model;
  /** Run one message through the core, show its change, and start its engine writes. */
  commit(message: Message): Commit;
  /**
   * Show changes stated in code at once and start their engine writes, exactly
   * like a gesture's: pending until they settle, dropped when refused. Throws,
   * before anything shows, for a change the engine would refuse or a record
   * the view doesn't have.
   */
  apply(changes: readonly StoreChange[]): Applied;
  /** Claim the effects an area performs (one runner per kind; last wins). */
  onEffect<K extends Effect['type']>(kind: K, runner: EffectRunner<K>): void;
  /** Claim the engine writes of stated changes (one writer; last wins). */
  onApply(writer: ApplyWriter): void;
}

/** The refs behind a list of model ids (records not yet confirmed have none). */
export const refsOfIn = (model: Model, ids: readonly Id[]): AnnotationRef[] =>
  ids.map((id) => refOf(model.byId[id])).filter((ref): ref is AnnotationRef => ref != null);

const sameIds = (left: readonly Id[], right: readonly Id[]): boolean =>
  left === right || (left.length === right.length && left.every((id, i) => id === right[i]));

/**
 * The record a ref names: its key, or, for an `nm` ref, the record on that
 * page with that name (as the engine resolves one), confirmed or not.
 */
export function recordOfRef(model: Model, ref: AnnotationRef): ModelAnnotation | null {
  const byKey = model.byId[annotationKey(ref)];
  if (byKey) return byKey;
  if (ref.kind !== 'nm') return null;
  for (const id of model.order) {
    const record = model.byId[id];
    if (
      record &&
      record.annotation.nm === ref.nm &&
      record.annotation.page.objectNumber === ref.page.objectNumber
    ) {
      return record;
    }
  }
  return null;
}

/**
 * The pending change a stated change makes, and the record it names. The
 * engine's own functions work it out (`annotationOfDraft`,
 * `applyAnnotationPatch`), so what shows is what the engine will write; they
 * throw for a change the engine would refuse.
 */
function statedChangeOf(
  model: Model,
  change: StoreChange,
): { id: Id; change: StoreChange; pending: RecordChange | null } {
  if (change.type === 'create') {
    const nm = change.draft.nm ?? generateUuid();
    const ref: AnnotationRef = { kind: 'nm', page: change.page, nm };
    const draft = { ...change.draft, nm } as AnnotationDraft;
    const onPage = model.order.filter(
      (id) => model.byId[id]?.annotation.page.objectNumber === change.page.objectNumber,
    ).length;
    // The annotations it links to are the engine's to look up as it writes
    // (as a change set links them): predicted without them, then stated.
    const { reply, parent, ...fields } = draft as AnnotationDraft & {
      reply?: { to: AnnotationRef; type?: 'reply' | 'group' } | null;
      parent?: AnnotationRef | null;
    };
    const annotation = {
      ...annotationOfDraft(fields as AnnotationDraft, { ref, index: onPage }),
      ...(reply ? { reply: { to: reply.to, type: reply.type ?? 'reply' } } : {}),
      ...(parent ? { parent } : {}),
    } as AnnotationDTO;
    const record: ModelAnnotation = {
      ...fromDTO(annotation),
      unconfirmed: true,
      source: sourceOfNew(annotation),
    };
    const id = record.id;
    return { id, change: { ...change, draft }, pending: { kind: 'create', record } };
  }
  const record = recordOfRef(model, change.ref);
  if (!record) {
    throw new PluginError('not-found', 'annotation', `no annotation ${annotationKey(change.ref)}`);
  }
  if (change.type === 'delete') return { id: record.id, change, pending: { kind: 'delete' } };
  const noFields = Object.keys(change.patch).every((name) => name === 'subtype');
  // A patch that says nothing, with no bytes, is no write at all.
  if (noFields && !change.resources) return { id: record.id, change, pending: null };
  // The engine's resolve rules, run now: a patch it would refuse throws
  // before anything shows. The record is then drawn as the appearance rule
  // says, exactly as after a gesture (core `appearance.ts`).
  const after = applyAnnotationPatch(record.annotation, change.patch);
  return {
    id: record.id,
    change,
    pending: { kind: 'edit', patch: change.patch, fields: drawnAfter(record, after) },
  };
}

export function createStore(
  ctx: Pick<AnnotationContext, 'state'>,
  view: View,
  intents: Intents,
  events: AnnotationEvents,
): AnnotationStore {
  // Keyed by effect type, so a runner only ever receives effects of its own kind.
  const runners = new Map<Effect['type'], (effect: Effect, model: Model) => IntentWrite | void>();
  let writer: ApplyWriter | null = null;
  const model = view.model;

  const commit = (message: Message): Commit => {
    const before = model();
    const result = update(before, message);
    const staged = intents.begin(before, result);
    const writes: IntentWrite[] = [];
    for (const effect of result.effects) {
      const write = runners.get(effect.type)?.(effect, model());
      if (write) writes.push(write);
    }
    return { effects: result.effects, written: intents.run(staged, writes) };
  };

  const apply = (changes: readonly StoreChange[]): Applied => {
    const before = model();
    // Everything is worked out before anything shows: one refused change stages none.
    let stated: ReturnType<typeof statedChangeOf>[];
    try {
      stated = changes.map((change) => statedChangeOf(before, change));
    } catch (error) {
      throw toPluginError('annotation', error);
    }
    const staged = intents.beginStated(
      stated.flatMap(({ id, pending }) => (pending ? [{ id, change: pending }] : [])),
    );
    const writes = writer
      ? stated.flatMap(({ id, change, pending }) => (pending ? [writer!(change, id)] : []))
      : [];
    return { ids: stated.map(({ id }) => id), written: intents.run(staged, writes) };
  };

  // The selection, draft and editing events, derived from each change of the
  // model's session (a record leaving the view changes the session too, via `forget`).
  let announced = model();
  ctx.state.onChange(() => {
    const next = model();
    const previous = announced;
    announced = next;
    if (!sameIds(previous.selected, next.selected)) {
      events.selectionChanged.emit({
        refs: refsOfIn(next, next.selected),
        previousRefs: refsOfIn(previous, previous.selected),
      });
    }
    if (previous.draft !== next.draft)
      events.draftChanged.emit({ draft: creationDraftAnchor(next) });
    if (previous.editing !== next.editing) {
      events.editingChanged.emit({
        ref: next.editing ? refOf(next.byId[next.editing]) : null,
      });
    }
  });

  return {
    model,
    commit,
    apply,
    onApply: (next) => {
      writer = next;
    },
    onEffect: (kind, runner) => {
      runners.set(kind, (effect, current) =>
        runner(effect as Extract<Effect, { type: typeof kind }>, current),
      );
    },
  };
}
