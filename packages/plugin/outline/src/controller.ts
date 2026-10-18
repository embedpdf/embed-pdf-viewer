import {
  memo,
  memoByKey,
  PluginError,
  toPluginError,
  type DocCapability,
  type OperationOptions,
  type PendingChange,
  type PluginContext,
} from '@embedpdf/core';
import type {
  ChangeItem,
  ChangeOp,
  DocumentEvent,
  OutlineItem,
  OutlineItemDraft,
  OutlineItemRef,
  PdfLinkTargetWritable,
} from '@embedpdf/engine-core/runtime';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { LinkToken, resolveLinkTarget, type LinkActivation } from '@embedpdf/plugin-link/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import type {
  OutlineCapability,
  OutlineChangedEvent,
  OutlineResyncedEvent,
  OutlineRow,
} from './contract';
import {
  ancestorsOf,
  childrenOf,
  collapsed,
  expanded,
  itemsOf,
  outlineKeyOf,
  pruned,
  rowsOf,
  seeded,
  selected,
  spotAt,
  spotsOf,
  topmostOf,
  treeOf,
  type OutlineState,
  type OutlineTree,
} from './model';
import { foldOutline, predictOutline, undoOf } from './sync/tree';

const MODIFY: DocCapability = 'doc.outline.modify';

/** The most a PDF text string holds in every PDF app (ISO 32000-2 Annex C). */
const MAX_TITLE_LENGTH = 32_767;

const NO_ITEMS: readonly OutlineItem[] = Object.freeze([]);
const NO_ROWS: readonly OutlineRow[] = Object.freeze([]);
const NO_REFS: readonly OutlineItemRef[] = Object.freeze([]);

/** The fact a confirmed outline event reports, or `null` for any other event. */
function factOf(event: DocumentEvent): Omit<OutlineChangedEvent, 'origin'> | null {
  switch (event.type) {
    case 'outline.created':
      return { type: 'created', items: [event.item.ref] };
    case 'outline.updated':
      return { type: 'updated', items: [event.item.ref] };
    case 'outline.moved':
      return { type: 'moved', items: event.meta.changed };
    case 'outline.deleted':
      return { type: 'deleted', items: event.deleted };
    case 'outline.restored':
      return { type: 'restored', items: event.items.map((item) => item.ref) };
    default:
      return null;
  }
}

/** The answer's item for a change's only op, of the type it names. */
type ItemOf<T extends ChangeItem['type']> = Extract<ChangeItem, { type: T }>;

/**
 * The outline controller. The outline is a mirror, read when something asks
 * for it (`ensureLoaded()`, what `outlineState` does), and every read shows
 * its `view()`: the engine's outline with this session's pending changes on
 * top. Each write is one change on the document's queue, so it shows at
 * once, is one step of the history, and undoing it shows the outline as it
 * was. Expanded and selected items are session state.
 */
export function createOutlineController(ctx: PluginContext<OutlineState>) {
  const changed = ctx.events.source<OutlineChangedEvent>();
  const resynced = ctx.events.source<OutlineResyncedEvent>();

  const outline = ctx.mirror<OutlineTree | null>({
    name: 'outline',
    onDemand: true,
    initial: () => null,
    load: async (doc) => ({ value: treeOf(await doc.outline.get()) }),
    fold: foldOutline,
    predict: predictOutline,
    changed: ({ cause, event, next }) => {
      if (!next) return;
      if (cause === 'load') {
        ctx.state.update(seeded, next);
        ctx.state.update(pruned, outline.view() ?? next);
        resynced.emit({ outline: { items: itemsOf(next), incomplete: next.incomplete } });
        return;
      }
      const fact = event && 'origin' in event ? factOf(event) : null;
      if (fact && event && 'origin' in event) changed.emit({ ...fact, origin: event.origin });
    },
  });

  const view = (): OutlineTree | null => outline.view();
  const stage = () => ctx.tryGet(StageToken);

  /* ── reads ─────────────────────────────────────────────────────────────── */

  const list = memo(
    () => [view()] as const,
    (tree) => (tree ? itemsOf(tree) : NO_ITEMS),
  );
  const get = (ref: OutlineItemRef): OutlineItem | null => view()?.items[outlineKeyOf(ref)] ?? null;
  const childrenByKey = memoByKey(
    (_key: string) => [view()] as const,
    (key, tree): readonly OutlineItem[] =>
      tree
        ? childrenOf(tree, key).flatMap((child) => {
            const item = tree.items[child];
            return item ? [item] : [];
          })
        : NO_ITEMS,
    { maxEntries: 256 },
  );
  const listRows = memo(
    () => [view(), ctx.state.get().expanded] as const,
    (tree, open) => (tree ? rowsOf(tree, open) : NO_ROWS),
  );
  const getSelected = memo(
    () => [view(), ctx.state.get().selected] as const,
    (tree, refs) =>
      tree && refs.length > 0
        ? refs.filter((ref) => tree.items[outlineKeyOf(ref)] !== undefined)
        : NO_REFS,
  );

  // The items in reading order, again when the outline or the page order changes.
  const spots = memo(
    () => [list(), ctx.document()?.revision ?? 0] as const,
    (items) => spotsOf(items, (page) => ctx.getPage(page)?.index ?? null),
  );
  const currentSpot = memo(
    () => {
      const destination = stage()?.getCurrentDestination() ?? null;
      const pageIndex = destination ? (ctx.getPage(destination.page)?.index ?? -1) : -1;
      const y = destination?.kind === 'xyz' ? (destination.y ?? 0) : 0;
      return [spots(), pageIndex, y] as const;
    },
    (all, pageIndex, y) => (pageIndex < 0 ? null : spotAt(all, pageIndex, y)),
  );
  const getCurrentItem = (): OutlineItemRef | null => {
    const spot = currentSpot();
    return spot ? (view()?.items[spot.key]?.ref ?? null) : null;
  };

  const getCurrentViewTarget = (): PdfLinkTargetWritable | null => {
    const destination = stage()?.getCurrentDestination() ?? null;
    return destination ? { kind: 'goto', destination } : null;
  };

  /* ── the session ───────────────────────────────────────────────────────── */

  const known = (ref: OutlineItemRef): boolean => get(ref) !== null;
  const keysWithChildren = (): string[] => {
    const tree = view();
    return tree ? Object.keys(tree.children).filter((key) => tree.items[key]) : [];
  };
  const isExpanded = (ref: OutlineItemRef): boolean => {
    const tree = view();
    const key = outlineKeyOf(ref);
    return !!tree && childrenOf(tree, key).length > 0 && ctx.state.get().expanded[key] === true;
  };
  const reveal = (ref: OutlineItemRef): void => {
    const tree = view();
    if (tree) ctx.state.update(expanded, ancestorsOf(tree, outlineKeyOf(ref)));
  };

  /* ── activation ────────────────────────────────────────────────────────── */

  const activate = (ref: OutlineItemRef): LinkActivation => {
    const item = get(ref);
    if (!item) {
      throw new PluginError('not-found', 'outline', `the outline has no item ${ref.objectNumber}`);
    }
    // An /A runs as a link's does: a script, a chain of actions, a GoTo.
    const actions = ctx.tryGet(ActionsToken);
    if (item.action && actions) {
      const dispatch = actions.execute(item.action, {
        origin: 'user',
        source: { kind: 'outline', item: item.ref },
        event: { scope: 'activate' },
      });
      return { outcome: 'dispatched', dispatch };
    }
    if (!item.target) return { outcome: 'none' };
    // The link plugin opens websites through the framework; without it the
    // caller is handed what it can't do itself.
    const link = ctx.tryGet(LinkToken);
    if (link) return link.activate(item.target);
    const resolution = resolveLinkTarget(item.target, (page) => ctx.getPage(page) !== null);
    switch (resolution.kind) {
      case 'destination': {
        const main = stage();
        if (!main) return { outcome: 'destination', destination: resolution.destination };
        main.goToDestination(resolution.destination);
        return { outcome: 'revealed' };
      }
      case 'uri':
        return { outcome: 'uri', uri: resolution.uri };
      case 'named':
        return { outcome: 'named', name: resolution.name };
      default:
        return { outcome: 'reported', target: resolution.target };
    }
  };

  /* ── writes ────────────────────────────────────────────────────────────── */

  /** Refuse before anything starts: without `doc.outline.modify`, or once the caller cancelled. */
  const refuse = (operation: string, options?: OperationOptions): void => {
    ctx.assertAllowed(MODIFY, operation);
    if (options?.signal?.aborted) {
      throw new PluginError('operation-cancelled', 'outline', `${operation} was cancelled`);
    }
  };

  /** A ref the read outline doesn't have; before the first read lands the engine decides. */
  const assertKnown = (ref: OutlineItemRef, operation: string): void => {
    if (view() && !known(ref)) {
      throw new PluginError(
        'not-found',
        'outline',
        `${operation}: the outline has no item ${ref.objectNumber}`,
      );
    }
  };

  /** Stage one user action: it shows at once, and undoing it shows the outline as it was. */
  const stageChange = (verb: string, ops: readonly ChangeOp[], count?: number): PendingChange =>
    ctx.changes.stage({
      label: count === undefined ? { key: `outline.${verb}` } : { key: `outline.${verb}`, count },
      ops,
      undo: undoOf(view(), ops),
    });

  /** The engine's answer to a staged change: its first item. */
  const answer = async <T extends ChangeItem['type']>(
    change: PendingChange,
    options?: OperationOptions,
  ): Promise<ItemOf<T>> => {
    try {
      const result = await ctx.cancellable(options?.signal, change.result);
      return result.items[0] as ItemOf<T>;
    } catch (error) {
      throw toPluginError('outline', error);
    }
  };

  /** A final name for the new item, from the document's pool. */
  const takeObjectNumber = async (): Promise<number> => {
    for (;;) {
      const number = ctx.changes.takeObjectNumber();
      if (number !== null) return number;
      await ctx.changes.reserveObjectNumbers(1);
    }
  };

  /** A new item's title: the selected text on one line, else "Untitled" in the viewer's language. */
  const defaultTitle = async (options?: OperationOptions): Promise<string> => {
    const selection = ctx.tryGet(SelectionToken);
    if (selection?.hasSelection()) {
      try {
        const text = (await selection.readText(options)).replace(/\s+/g, ' ').trim();
        if (text) return text.slice(0, MAX_TITLE_LENGTH);
      } catch (error) {
        // Without the right to copy text the title falls back; a cancel does not.
        if (options?.signal?.aborted) throw toPluginError('outline', error);
      }
    }
    return ctx.tryGet(I18nToken)?.t('outline.untitled', { fallback: 'Untitled' }) ?? 'Untitled';
  };

  const create: OutlineCapability['create'] = async (input = {}, options) => {
    refuse('outline.create', options);
    const { parent = null, position, title, target, color, bold, italic } = input;
    if (parent) assertKnown(parent, 'outline.create');
    const chosenTarget = target === undefined ? getCurrentViewTarget() : target;
    const data: OutlineItemDraft = {
      title: title ?? (await defaultTitle(options)),
      ...(chosenTarget ? { target: chosenTarget } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(bold !== undefined ? { bold } : {}),
      ...(italic !== undefined ? { italic } : {}),
    };
    const objectNumber = await takeObjectNumber();
    const change = stageChange('create', [
      { type: 'outline.create', parent, ...(position ? { position } : {}), data, objectNumber },
    ]);
    if (options?.select) {
      const ref = { kind: 'objectNumber', objectNumber } as const;
      reveal(ref);
      ctx.state.update(selected, [ref]);
    }
    const item = await answer<'outline.create'>(change, options);
    return { item: item.item };
  };

  const update: OutlineCapability['update'] = async (ref, patch, options) => {
    refuse('outline.update', options);
    assertKnown(ref, 'outline.update');
    const change = stageChange('update', [{ type: 'outline.update', ref, patch }]);
    const item = await answer<'outline.update'>(change, options);
    return { item: item.item };
  };

  const move: OutlineCapability['move'] = async (refs, parent, position, options) => {
    refuse('outline.move', options);
    if (refs.length === 0) return;
    for (const ref of refs) assertKnown(ref, 'outline.move');
    if (parent) assertKnown(parent, 'outline.move');
    const change = stageChange('move', [{ type: 'outline.move', refs, parent, position }]);
    await answer<'outline.move'>(change, options);
  };

  const remove: OutlineCapability['delete'] = async (refs, options) => {
    refuse('outline.delete', options);
    for (const ref of refs) assertKnown(ref, 'outline.delete');
    const tree = view();
    const named = tree ? topmostOf(tree, refs) : refs;
    if (named.length === 0) return;
    const change = stageChange(
      'delete',
      named.map((ref): ChangeOp => ({ type: 'outline.delete', ref })),
      named.length,
    );
    await answer<'outline.delete'>(change, options);
  };

  const api: OutlineCapability = {
    list,
    get,
    getChildren: (parent) => childrenByKey(outlineKeyOf(parent)),
    listRows,
    getCurrentItem,
    isIncomplete: () => view()?.incomplete ?? false,
    getStatus: outline.getStatus,
    ensureLoaded: (options) => ctx.cancellable(options?.signal, outline.ensureLoaded()),
    refresh: (options) => ctx.cancellable(options?.signal, outline.refresh()),

    isExpanded,
    expand: (ref) => {
      if (known(ref)) ctx.state.update(expanded, [outlineKeyOf(ref)]);
    },
    collapse: (ref) => ctx.state.update(collapsed, [outlineKeyOf(ref)]),
    toggle: (ref) => {
      if (isExpanded(ref)) ctx.state.update(collapsed, [outlineKeyOf(ref)]);
      else if (known(ref)) ctx.state.update(expanded, [outlineKeyOf(ref)]);
    },
    expandAll: () => ctx.state.update(expanded, keysWithChildren()),
    collapseAll: () => ctx.state.update(collapsed, Object.keys(ctx.state.get().expanded)),
    reveal,
    getSelected,
    select: (refs) => ctx.state.update(selected, refs.filter(known)),

    activate,

    canEdit: () => ctx.allows(MODIFY),
    getCurrentViewTarget,
    create,
    update,
    move,
    delete: remove,

    onChanged: changed.on,
    onResynced: resynced.on,
  };

  return { api };
}
