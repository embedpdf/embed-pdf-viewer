'use client';

import { Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type MouseEvent,
  type SetStateAction,
} from 'react';

import { formatPageRanges, parsePageRanges } from './files';
import { loadMerge } from './load-merge';
import type { PageSource, Thumbnail } from './merge';
import { toolEngine } from '../shared/engine';

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** The grid, in px: the narrowest a page may be, the space around and between pages. */
const MIN_PAGE_WIDTH = 92;
const GAP = 12;
const PADDING = 12;
/** Under each page: its number, and the space above it. */
const LABEL_HEIGHT = 24;
/** Rows made beyond the ones in view, so a short scroll finds pages already there. */
const EXTRA_ROWS = 2;
/** The most pictures kept at once; the ones furthest from view are freed first. */
const KEEP_PICTURES = 120;

interface GridLayout {
  readonly columns: number;
  readonly pageWidth: number;
  /** From the top of one row to the top of the next. */
  readonly rowStep: number;
  readonly height: number;
}

/** Columns of at least {@link MIN_PAGE_WIDTH} that fill `width`, and the rows they make. */
function gridLayout(width: number, pageCount: number): GridLayout {
  const inner = Math.max(0, width - 2 * PADDING);
  const columns = Math.max(2, Math.floor((inner + GAP) / (MIN_PAGE_WIDTH + GAP)));
  const pageWidth = (inner - GAP * (columns - 1)) / columns;
  const rowStep = (pageWidth * 4) / 3 + LABEL_HEIGHT + GAP;
  const rows = Math.ceil(pageCount / columns);
  return { columns, pageWidth, rowStep, height: 2 * PADDING + rows * rowStep - GAP };
}

/** The pages in view, `first` up to `end`. */
interface InView {
  readonly first: number;
  readonly end: number;
}

/** Over {@link KEEP_PICTURES}, free the pictures furthest from the pages in view. */
function freeFarPictures(
  drawn: Map<number, Thumbnail>,
  { first, end }: InView,
  setPictures: Dispatch<SetStateAction<ReadonlyMap<number, string>>>,
) {
  const extra = drawn.size - KEEP_PICTURES;
  if (extra <= 0) return;
  const middle = (first + end) / 2;
  const furthest = [...drawn.keys()]
    .filter((index) => index < first || index >= end)
    .sort((left, right) => Math.abs(right - middle) - Math.abs(left - middle))
    .slice(0, extra);
  for (const index of furthest) {
    drawn.get(index)?.revoke();
    drawn.delete(index);
  }
  setPictures((current) => {
    const next = new Map(current);
    for (const index of furthest) next.delete(index);
    return next;
  });
}

/** What a page that couldn't be drawn keeps: its placeholder, and no second try. */
const NOT_DRAWN: Thumbnail = { url: '', revoke: () => {} };

/**
 * The pages of one file, to choose which go into the merge. Every page is in until it's left
 * out, so nothing changes for someone who opens this and closes it again. A page is left out or
 * put back with a tap (Shift takes the pages between too), or the pages are typed, `1-3, 8`:
 * the quick way through a long file.
 *
 * A file can have hundreds of pages, so the grid only makes the rows in view (and a few around
 * them), and draws pictures only for pages on screen, one at a time, while the file stays open.
 * Pictures far from view are freed again.
 */
export function PagePicker({
  name,
  bytes,
  password,
  pageCount,
  pages,
  onChange,
  onDone,
}: {
  name: string;
  bytes: Uint8Array;
  password?: string;
  pageCount: number;
  /** The chosen pages, 0-based and in order; `null` for every page. */
  pages: readonly number[] | null;
  onChange: (pages: readonly number[] | null) => void;
  onDone: () => void;
}) {
  const chosen = useMemo(() => new Set(pages ?? range(pageCount)), [pages, pageCount]);
  const fieldId = useId();
  const lastTapped = useRef<number | null>(null);

  // ── The grid's size and scroll, and the pages they put in view ──────────────────────────────
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 0, height: 0, top: 0 });
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () =>
      setView((current) => ({
        ...current,
        width: element.clientWidth,
        height: element.clientHeight,
      }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = gridLayout(view.width, pageCount);
  const measured = view.width > 0;
  const firstRow = Math.max(0, Math.floor((view.top - PADDING) / layout.rowStep) - EXTRA_ROWS);
  const lastRow = Math.floor((view.top + view.height - PADDING) / layout.rowStep) + EXTRA_ROWS;
  const first = measured ? firstRow * layout.columns : 0;
  const end = measured ? Math.min(pageCount, (lastRow + 1) * layout.columns) : 0;

  // ── Pictures: drawn for the pages in view, one at a time, the furthest freed ────────────────
  const [pictures, setPictures] = useState<ReadonlyMap<number, string>>(new Map());
  const [unavailable, setUnavailable] = useState(false);
  const source = useRef<PageSource | null>(null);
  const drawn = useRef(new Map<number, Thumbnail>());
  const inView = useRef<InView>({ first: 0, end: 0 });
  const drawing = useRef(false);
  inView.current = { first, end };

  const draw = useCallback(async () => {
    if (drawing.current || !source.current) return;
    drawing.current = true;
    const opened = source.current;
    for (;;) {
      // The next page in view without a picture; what's in view may have moved since the last.
      const { first: from, end: to } = inView.current;
      let next = -1;
      for (let index = from; index < to; index++) {
        if (!drawn.current.has(index)) {
          next = index;
          break;
        }
      }
      if (next < 0 || source.current !== opened) break;
      const picture = await opened.thumbnail(next);
      if (source.current !== opened) {
        picture?.revoke();
        break;
      }
      drawn.current.set(next, picture ?? NOT_DRAWN);
      if (picture) setPictures((current) => new Map(current).set(next, picture.url));
      freeFarPictures(drawn.current, inView.current, setPictures);
    }
    drawing.current = false;
  }, []);

  useEffect(() => {
    let closed = false;
    const pictureCache = drawn.current;
    void Promise.all([loadMerge(), toolEngine()])
      .then(([{ openPageSource }, engine]) => openPageSource(engine, bytes, password))
      .then((opened) => {
        if (closed) return void opened.close();
        source.current = opened;
        void draw();
      })
      .catch(() => setUnavailable(true));
    return () => {
      closed = true;
      const opened = source.current;
      source.current = null;
      pictureCache.forEach((picture) => picture.revoke());
      pictureCache.clear();
      setPictures(new Map());
      void opened?.close();
    };
  }, [bytes, password, draw]);

  // Other pages in view: draw what they're missing.
  useEffect(() => {
    void draw();
  }, [first, end, draw]);

  // ── Choosing ────────────────────────────────────────────────────────────────────────────────
  // The typed pages follow the taps, except while they're being typed, and while what was typed
  // doesn't read as pages: it stays, next to the message, to be fixed.
  const written = formatPageRanges(pages ?? range(pageCount));
  const [typed, setTyped] = useState(written);
  const [typing, setTyping] = useState(false);
  const [typo, setTypo] = useState(false);
  useEffect(() => {
    if (!typing && !typo) setTyped(written);
  }, [written, typing, typo]);

  const choose = (next: Set<number>) => {
    setTypo(false);
    onChange(next.size === pageCount ? null : [...next].sort((left, right) => left - right));
  };

  const tap = (index: number, event: MouseEvent) => {
    const next = new Set(chosen);
    const keep = !chosen.has(index);
    const from = event.shiftKey && lastTapped.current !== null ? lastTapped.current : index;
    for (let page = Math.min(from, index); page <= Math.max(from, index); page++) {
      if (keep) next.add(page);
      else next.delete(page);
    }
    lastTapped.current = index;
    choose(next);
  };

  // What the field holds now, not what was last rendered: a paste can leave it in one go.
  const field = useRef<HTMLInputElement>(null);
  const applyTyped = () => {
    const parsed = parsePageRanges(field.current?.value ?? typed, pageCount);
    setTypo(parsed === null);
    if (parsed) choose(new Set(parsed));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    applyTyped();
  };

  return (
    <div
      role="group"
      aria-label={`Pages of ${name}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone();
      }}
      className="border-ep-border bg-ep-bg mt-3 rounded-xl border"
    >
      <div className="flex flex-col gap-3 p-3 min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between">
        <p className="text-ep-ink m-0 font-sans text-sm">
          {pages
            ? 'Tap a page to leave it out or put it back, or type the pages you want.'
            : 'Every page is in. Tap a page to leave it out, or type the pages you want.'}
        </p>
        <form
          onSubmit={submit}
          className="flex min-w-0 items-center gap-2 min-[641px]:flex-shrink-0"
        >
          <label className="text-ep-ink font-sans text-sm font-semibold" htmlFor={fieldId}>
            Pages
          </label>
          <input
            ref={field}
            id={fieldId}
            type="text"
            inputMode="numeric"
            value={typed}
            placeholder="1-3, 8"
            aria-invalid={typo}
            onFocus={() => setTyping(true)}
            onChange={(event) => {
              setTyped(event.target.value);
              setTypo(false);
            }}
            onBlur={() => {
              applyTyped();
              setTyping(false);
            }}
            className={`h-9 w-full min-w-0 flex-1 rounded-lg border bg-white px-2.5 font-sans text-sm outline-none min-[641px]:w-[180px] min-[641px]:flex-none ${
              typo ? 'border-[#B42318]' : 'border-ep-border focus:border-ep-blue'
            }`}
          />
          <button
            type="button"
            onClick={() => choose(new Set(range(pageCount)))}
            className="text-ep-blue hover:bg-ep-mist h-9 rounded-lg px-2.5 font-sans text-sm font-bold"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => choose(new Set())}
            className="text-ep-blue hover:bg-ep-mist h-9 rounded-lg px-2.5 font-sans text-sm font-bold"
          >
            None
          </button>
        </form>
      </div>
      {typo && (
        <p
          role="alert"
          className="m-0 px-3 pb-2 font-sans text-[13px] font-semibold text-[#B42318]"
        >
          Type page numbers from 1 to {pageCount}, like 1-3, 8.
        </p>
      )}
      {unavailable && (
        <p className="text-ep-soft m-0 px-3 pb-2 font-sans text-[13px]">
          The pages can’t be shown right now, but you can still choose them by number.
        </p>
      )}

      <div
        ref={scroller}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          setView((current) => (current.top === top ? current : { ...current, top }));
        }}
        className="h-[min(440px,60svh)] overflow-y-auto border-y border-[#E6EAF2] bg-white"
      >
        <div className="relative" style={{ height: measured ? layout.height : 0 }}>
          {range(end - first).map((offset) => {
            const index = first + offset;
            const on = chosen.has(index);
            const picture = pictures.get(index);
            return (
              <button
                key={index}
                type="button"
                aria-pressed={on}
                aria-label={`Page ${index + 1}${on ? '' : ', left out'}`}
                onClick={(event) => tap(index, event)}
                style={{
                  top: PADDING + Math.floor(index / layout.columns) * layout.rowStep,
                  left: PADDING + (index % layout.columns) * (layout.pageWidth + GAP),
                  width: layout.pageWidth,
                }}
                className="focus-visible:outline-ep-blue group absolute flex flex-col items-center gap-1.5 rounded-lg focus-visible:outline-2"
              >
                <span
                  className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border-2 bg-white transition-[opacity,border-color] ${
                    on
                      ? 'border-ep-blue shadow-[0_6px_16px_-10px_rgba(8,118,253,0.6)]'
                      : 'border-ep-border opacity-45 grayscale group-hover:opacity-70'
                  }`}
                >
                  {picture ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a page the engine drew
                    <img src={picture} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="bg-ep-tint h-full w-full" />
                  )}
                  <span
                    className={`absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      on ? 'border-ep-blue bg-ep-blue text-white' : 'border-ep-faint bg-white'
                    }`}
                  >
                    {on && <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={3} />}
                  </span>
                </span>
                <span
                  className={`font-sans text-xs font-semibold leading-[18px] ${on ? 'text-ep-navy' : 'text-ep-soft'}`}
                >
                  {index + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-3">
        <p className="text-ep-muted m-0 font-sans text-sm" aria-live="polite">
          <span className="text-ep-navy font-bold">{chosen.size}</span> of {pageCount} pages will be
          merged
        </p>
        <button
          type="button"
          onClick={onDone}
          className="bg-ep-navy inline-flex h-9 items-center rounded-lg px-4 font-sans text-sm font-bold text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}
