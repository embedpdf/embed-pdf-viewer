'use client';

import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  LayoutGridIcon,
  SquareLock02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

import { formatPageRanges } from './files';
import type { Thumbnail } from './merge';
import { PagePicker } from './page-picker';
import { formatSize, pageCountLabel } from '../shared/files';
import { UnlockForm } from '../shared/unlock-form';

export type EntryState =
  | { readonly kind: 'reading' }
  | {
      readonly kind: 'ready';
      readonly pageCount: number;
      readonly thumbnail: Thumbnail | null;
      readonly signed: boolean;
      readonly password?: string;
    }
  | { readonly kind: 'locked'; readonly incorrect: boolean; readonly trying: boolean }
  | { readonly kind: 'not-pdf' }
  | { readonly kind: 'unreadable' };

/** A row: one file the user added, what reading it found, and which of its pages go in. */
export interface Entry {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly bytes: Uint8Array | null;
  readonly state: EntryState;
  /** The pages to merge, 0-based and in order; `null` for every page, which is the start. */
  readonly pages: readonly number[] | null;
}

export type ReadyEntry = Entry & { readonly state: Extract<EntryState, { kind: 'ready' }> };

export const isReady = (entry: Entry): entry is ReadyEntry =>
  entry.state.kind === 'ready' && entry.bytes !== null;

/** How many of a ready file's pages go into the merge. */
export const chosenCount = (entry: ReadyEntry): number =>
  entry.pages?.length ?? entry.state.pageCount;

export const revokeThumbnail = (entry: Entry) => {
  if (entry.state.kind === 'ready') entry.state.thumbnail?.revoke();
};

const ICON_BUTTON =
  'text-ep-soft hover:text-ep-navy hover:bg-ep-tint focus-visible:outline-ep-blue inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-30';

/** Longer than this, the chosen pages read as a count only: the row stays one line. */
const RANGES_SHOWN = 24;

export interface HandleProps {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** What the row says about its pages: all of them, some (and which), or none. */
function pagesLine(entry: ReadyEntry): string {
  const total = entry.state.pageCount;
  if (!entry.pages) return pageCountLabel(total);
  if (entry.pages.length === 0) return `0 of ${total} pages`;
  const ranges = formatPageRanges(entry.pages, '–');
  const which = ranges.length <= RANGES_SHOWN ? ` (${ranges})` : '';
  return `${entry.pages.length} of ${total} pages${which}`;
}

export function FileRow({
  entry,
  index,
  count,
  disabled,
  dragged,
  picking,
  style,
  handle,
  onUp,
  onDown,
  onRemove,
  onUnlock,
  onPick,
  onPages,
}: {
  entry: Entry;
  index: number;
  count: number;
  disabled: boolean;
  dragged: boolean;
  /** Its page picker is open. */
  picking: boolean;
  style: CSSProperties | undefined;
  handle: HandleProps;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onUnlock: (password: string) => void;
  /** Open or close its page picker. */
  onPick: (open: boolean) => void;
  onPages: (pages: readonly number[] | null) => void;
}) {
  const { state } = entry;
  const leftOut = state.kind === 'not-pdf' || state.kind === 'unreadable';
  const ready = isReady(entry) ? entry : null;
  const noPages = ready?.pages?.length === 0;
  return (
    <li
      style={style}
      className={`border-ep-border relative rounded-2xl border bg-white p-2.5 transition-[transform,box-shadow] duration-150 min-[521px]:p-3 ${
        dragged ? 'shadow-[0_18px_40px_-18px_rgba(7,32,76,0.45)]' : ''
      } ${leftOut || noPages ? 'bg-ep-bg' : ''} ${picking ? 'border-ep-blue' : ''}`}
    >
      <div className="flex items-center gap-2 min-[521px]:gap-3">
        <button
          type="button"
          aria-label={`Move ${entry.name}. Use the arrow keys, or drag.`}
          disabled={disabled || count < 2}
          className={`${ICON_BUTTON} cursor-grab touch-none active:cursor-grabbing`}
          {...handle}
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} size={20} strokeWidth={2} />
        </button>
        <span className="text-ep-soft font-display hidden w-5 text-center text-sm font-bold min-[521px]:block">
          {index + 1}
        </span>
        <span
          className={`border-ep-border bg-ep-tint flex h-[72px] w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border ${
            noPages ? 'opacity-45 grayscale' : ''
          }`}
        >
          {state.kind === 'ready' && state.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a page the engine drew
            <img src={state.thumbnail.url} alt="" className="h-full w-full object-contain" />
          ) : state.kind === 'reading' ? (
            <span className="border-ep-mistDeep border-t-ep-blue h-4 w-4 animate-spin rounded-full border-2" />
          ) : state.kind === 'locked' ? (
            <HugeiconsIcon
              icon={SquareLock02Icon}
              size={22}
              strokeWidth={2}
              className="text-ep-soft"
            />
          ) : leftOut ? (
            <HugeiconsIcon
              icon={Alert02Icon}
              size={22}
              strokeWidth={2}
              className="text-[#B42318]"
            />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-ep-navy m-0 truncate font-sans text-[15px] font-bold"
            title={entry.name}
          >
            {entry.name}
          </p>
          <p className="text-ep-soft m-0 mt-0.5 font-sans text-[13px]">
            {ready ? `${pagesLine(ready)}, ` : ''}
            {formatSize(entry.size)}
            {state.kind === 'reading' && ', reading…'}
          </p>
          {ready && ready.state.pageCount > 1 && !picking && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(true)}
              aria-expanded={false}
              className="text-ep-blue hover:text-ep-blue700 mt-1 inline-flex items-center gap-1.5 font-sans text-[13px] font-bold disabled:opacity-50"
            >
              <HugeiconsIcon icon={LayoutGridIcon} size={14} strokeWidth={2.2} />
              {ready.pages ? 'Change pages' : 'Choose pages'}
            </button>
          )}
          {noPages && !picking && (
            <p className="m-0 mt-1 font-sans text-[13px] font-semibold text-[#B42318]">
              No pages chosen, so this file is left out.
            </p>
          )}
          {ready?.state.signed && (
            <p className="m-0 mt-1 font-sans text-[13px] text-[#8A5D00]">
              This PDF is signed. Its signature won’t be valid in the merged file.
            </p>
          )}
          {state.kind === 'locked' && (
            <UnlockForm
              state={state}
              name={entry.name}
              purpose="This PDF has a password. Enter it to merge the file."
              onUnlock={onUnlock}
            />
          )}
          {state.kind === 'not-pdf' && (
            <p className="m-0 mt-1 font-sans text-[13px] font-semibold text-[#B42318]">
              This isn’t a PDF, so it’s left out.
            </p>
          )}
          {state.kind === 'unreadable' && (
            <p className="m-0 mt-1 font-sans text-[13px] font-semibold text-[#B42318]">
              This PDF can’t be opened, so it’s left out. It may be damaged.
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center">
          <button
            type="button"
            onClick={onUp}
            disabled={disabled || index === 0}
            aria-label={`Move ${entry.name} up`}
            className={`${ICON_BUTTON} max-[520px]:hidden`}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={onDown}
            disabled={disabled || index === count - 1}
            aria-label={`Move ${entry.name} down`}
            className={`${ICON_BUTTON} max-[520px]:hidden`}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${entry.name}`}
            className={`${ICON_BUTTON} hover:!text-[#B42318]`}
          >
            <HugeiconsIcon icon={Delete02Icon} size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
      {ready && picking && (
        <PagePicker
          name={entry.name}
          bytes={ready.bytes!}
          password={ready.state.password}
          pageCount={ready.state.pageCount}
          pages={ready.pages}
          onChange={onPages}
          onDone={() => onPick(false)}
        />
      )}
    </li>
  );
}
