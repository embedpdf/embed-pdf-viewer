/**
 * The document's pages as the user sees them (`DocumentMeta.pages`): the
 * engine's pages with this session's pending changes replayed on top, through
 * engine-core's `pagesAfter`, as a mirror's `view()` shows its value
 * (mirror.ts). The stage, the thumbnails, the page selection and
 * `ctx.pageOf` all read them, so a page number in a verb is the page the
 * user sees, and a page edit shows before the engine answers.
 *
 * The engine's pages move with its layout events, this session's and other
 * sessions' alike. A change stops replaying once its last event folded: the
 * engine's pages hold it by then. A page that reads as it did is the same
 * object, and pages that all read as they did are the same list, so an
 * answer the prediction got right changes nothing.
 *
 * Pages a pending change makes (a blank insert, a deleted page coming back)
 * are in the list before the engine has them: `pending` names them, with
 * where their look comes from until it does.
 */
import {
  pagesAfter,
  pagesAfterRestore,
  type DocumentEvent,
  type PageLayout,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { ChangeViews, PredictedOp, QueuedChange } from './changes';
import { createFoldedChanges, replay, showingWith } from './mirror';
import { sameValue } from './same-value';
import type { PendingPage } from './types';

/** The pages as the user sees them, and those of them the engine doesn't have yet. */
export interface PageView {
  readonly pages: readonly PageLayout[];
  readonly pending: ReadonlyMap<PageObjectNumber, PendingPage>;
}

/** What a page mirror reads of the page view: which pages the engine has yet. */
export interface PageViewReads {
  /** Where a page's look comes from until the engine has it; null when it has it, or no such page. */
  pending(page: PageRef): PendingPage | null;
  /** Whether the page is one the user sees. */
  has(page: PageRef): boolean;
  /** The view changed. */
  onChange(listener: () => void): () => void;
}

/** The kernel's side of a document's page view. */
export interface PageViewController extends PageViewReads {
  /** The engine's pages: the snapshot at open, then each layout event's. */
  setEnginePages(pages: readonly PageLayout[]): void;
  /** One of the document's events: once it is a change's last, the change stops replaying. */
  fold(event: DocumentEvent): void;
  /** Work the view out again: the new one when it changed since the last time, else null. */
  refresh(): PageView | null;
  /** The view as the last `refresh` left it. */
  current(): PageView;
}

export const NO_PENDING_PAGES: ReadonlyMap<PageObjectNumber, PendingPage> = new Map();

const BLANK: PendingPage = Object.freeze({ look: 'blank' });
const OWN: PendingPage = Object.freeze({ look: 'own' });

/**
 * The engine's pages a document event carries, or null for an event that
 * doesn't change them (annotations, metadata): the list `pages.list()`
 * returns, so it replaces the engine's pages whole.
 */
export function layoutFromEvent(event: DocumentEvent) {
  switch (event.type) {
    case 'pages.reordered':
    case 'pages.rotated':
    case 'pages.deleted':
    case 'pages.inserted':
    case 'pages.restored':
      return event.layout;
    default:
      return null;
  }
}

/** One op of a pending change over the pages: the page ops, by the engine's rules. */
export function predictPages(pages: readonly PageLayout[], op: PredictedOp): readonly PageLayout[] {
  switch (op.type) {
    case 'pages.rotate':
    case 'pages.reorder':
    case 'pages.delete':
    case 'pages.insertBlank':
      return pagesAfter(pages, op);
    case 'pages.restore':
      return pagesAfterRestore(pages, op.pages);
    default:
      return pages;
  }
}

export function createPageView(options: {
  changes: ChangeViews;
  report: (error: unknown) => void;
}): PageViewController {
  const { changes, report } = options;
  const folded = createFoldedChanges(changes);
  const listeners = new Set<() => void>();
  let engine: readonly PageLayout[] = [];
  /** What the last replay gave, before it was matched to the view: equal means nothing moved. */
  let replayed: readonly PageLayout[] = engine;
  let view: PageView = { pages: engine, pending: NO_PENDING_PAGES };

  const shown = (): QueuedChange[] => showingWith(changes, [], folded);

  const refresh = (): PageView | null => {
    const showing = shown();
    const next = replay(engine, showing, predictPages, report);
    if (next === replayed) return null;
    replayed = next;
    const pages = keptWhereSame(view.pages, next);
    const pending = keptIfSame(view.pending, pendingOf(pages, engine, showing));
    if (pages === view.pages && pending === view.pending) return null;
    view = { pages, pending };
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        report(error);
      }
    }
    return view;
  };

  return {
    setEnginePages(pages) {
      engine = pages;
    },
    fold(event) {
      folded.add(event);
    },
    refresh,
    current: () => view,
    pending: (page) => view.pending.get(page.objectNumber) ?? null,
    has: (page) => view.pages.some((each) => each.ref.objectNumber === page.objectNumber),
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * `next`, with each page that reads as it does in `previous` being that
 * page, and `previous` itself when every page is and none moved.
 */
function keptWhereSame(
  previous: readonly PageLayout[],
  next: readonly PageLayout[],
): readonly PageLayout[] {
  const before = new Map(previous.map((page) => [page.ref.objectNumber, page]));
  let same = previous.length === next.length;
  const pages = next.map((page, index) => {
    const was = before.get(page.ref.objectNumber);
    const kept = was !== undefined && sameValue(was, page) ? was : page;
    if (kept !== previous[index]) same = false;
    return kept;
  });
  return same ? previous : pages;
}

/** `next`, or `previous` when it names the same pages with the same looks. */
function keptIfSame(
  previous: ReadonlyMap<PageObjectNumber, PendingPage>,
  next: ReadonlyMap<PageObjectNumber, PendingPage>,
): ReadonlyMap<PageObjectNumber, PendingPage> {
  if (previous.size !== next.size) return next;
  for (const [page, look] of next) if (previous.get(page) !== look) return next;
  return previous;
}

/** The pages the user sees that the engine doesn't have, by the change that makes each one. */
function pendingOf(
  pages: readonly PageLayout[],
  engine: readonly PageLayout[],
  showing: readonly QueuedChange[],
): ReadonlyMap<PageObjectNumber, PendingPage> {
  const held = new Set(engine.map((page) => page.ref.objectNumber));
  const unheld = pages.filter((page) => !held.has(page.ref.objectNumber));
  if (unheld.length === 0) return NO_PENDING_PAGES;
  const looks = new Map<PageObjectNumber, PendingPage>();
  for (const change of showing) {
    for (const op of change.shows) {
      if (op.type === 'pages.insertBlank') {
        for (const number of op.objectNumbers ?? []) looks.set(number, BLANK);
      } else if (op.type === 'pages.restore') {
        for (const { page } of op.pages) looks.set(page.ref.objectNumber, OWN);
      }
    }
  }
  return new Map(
    unheld.map((page) => [page.ref.objectNumber, looks.get(page.ref.objectNumber) ?? OWN]),
  );
}
