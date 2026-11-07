'use client';

import type { Viewer } from '@embedpdf/viewer-react';
import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  LayoutGridIcon,
  PlusSignIcon,
  SortingAZ01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import {
  chosenCount,
  FileRow,
  isReady,
  revokeThumbnail,
  type Entry,
  type ReadyEntry,
} from './file-row';
import { moveItem, outputFileName, sortByName } from './files';
import { loadMerge } from './load-merge';
import { MERGE_COPY } from '../content';
import { DropOverlay, DropZone, useFilePicker, useWindowFileDrop } from '../shared/drop-zone';
import { toolEngine, useWarmEngine } from '../shared/engine';
import { formatSize, looksLikePdf, pageCountLabel } from '../shared/files';
import { clearHandedFile, peekHandedFile, type HandedFile } from '../shared/handoff';
import { NextSteps } from '../shared/next-steps';
import { savedFile, saveFile, type SavedFile } from '../shared/save-file';
import { TOOL_ANCHOR } from '../shared/tool-anchor';

const ToolViewer = dynamic(
  () => import('../shared/tool-viewer').then((module) => module.ToolViewer),
  {
    ssr: false,
    loading: () => <Spinner label="Opening the pages…" />,
  },
);

/**
 * What the merged file doesn't need for moving pages around. What stays: the page thumbnails and
 * their page commands, reading and printing.
 */
const ORGANIZE_DISABLED = [
  'annotations',
  'shapes',
  'stamps',
  'comments',
  'forms',
  'signatures',
  'redaction',
  'measurement',
  'attachments',
  'outline',
];

type Phase =
  | { readonly kind: 'edit' }
  | { readonly kind: 'merging'; readonly done: number; readonly total: number }
  | { readonly kind: 'done'; readonly file: SavedFile; readonly pageCount: number }
  | { readonly kind: 'organize'; readonly file: SavedFile; readonly pageCount: number };

/** The space between rows, in px: `gap-2.5`. Rows a drag passes move by its height plus this. */
const ROW_GAP = 10;

/** Above this much on an iPhone or iPad, Safari may reload the page to free memory. */
const PHONE_MEMORY_HINT = 300 * 1024 * 1024;

const isApplePhoneOrTablet = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let nextId = 0;
const newId = () => `file-${++nextId}`;

function Spinner({ label }: { label: string }) {
  return (
    <div className="text-ep-soft flex h-full min-h-[240px] items-center justify-center gap-3 font-sans text-sm font-medium">
      <span className="border-ep-mistDeep border-t-ep-blue h-5 w-5 animate-spin rounded-full border-2" />
      {label}
    </div>
  );
}

const SECONDARY_BUTTON =
  'border-ep-border text-ep-navy hover:border-ep-blue hover:text-ep-blue focus-visible:outline-ep-blue inline-flex h-10 items-center gap-2 rounded-[10px] border bg-white px-3.5 font-sans text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Merge PDF: add files, put them in order, press one button. Every page of every file goes in,
 * unless a file's pages are chosen in its row. Moving or rotating single pages happens afterwards
 * in the viewer, for the few who want it. A file with a problem says so in its own row and the
 * rest keep working.
 */
export function MergeTool() {
  useWarmEngine();
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'edit' });
  const [bookmarkEachFile, setBookmarkEachFile] = useState(true);
  const [fileName, setFileName] = useState('merged');
  const [failure, setFailure] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // The row whose pages are being chosen: one at a time, so the list stays readable.
  const [picking, setPicking] = useState<string | null>(null);

  // The latest rows, for the async reads (a row removed meanwhile frees its thumbnail) and the
  // cleanup when the page goes.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Files are read one after another, so a big drop doesn't open them all at once.
  const readQueue = useRef<Promise<void>>(Promise.resolve());
  // While pages are rearranged: the viewer, and the last file its changes were saved to.
  const viewerRef = useRef<Viewer | null>(null);
  const edited = useRef<SavedFile | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);

  useEffect(
    () => () => {
      entriesRef.current.forEach(revokeThumbnail);
      if (edited.current) URL.revokeObjectURL(edited.current.url);
      const current = phaseRef.current;
      if (current.kind === 'done' || current.kind === 'organize')
        URL.revokeObjectURL(current.file.url);
    },
    [],
  );

  // A step that's shorter than the last (the result after a long list) can leave the tool's top
  // under the sticky header: bring it back into view. The card's scroll margin is the header.
  const step = phase.kind === 'merging' ? 'edit' : phase.kind;
  useEffect(() => {
    const tool = document.getElementById(TOOL_ANCHOR);
    if (!tool) return;
    const header = parseFloat(getComputedStyle(tool).scrollMarginTop) || 0;
    if (tool.getBoundingClientRect().top >= header) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tool.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [step]);

  const patch = useCallback((id: string, change: Partial<Entry>) => {
    setEntries((current) => {
      if (!current.some((entry) => entry.id === id)) {
        // The row went while its file was read: free what the read made.
        if (change.state?.kind === 'ready') change.state.thumbnail?.revoke();
        return current;
      }
      return current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry));
    });
  }, []);

  const read = useCallback(
    async (id: string, file: File, password?: string) => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!looksLikePdf(bytes)) {
          patch(id, { state: { kind: 'not-pdf' } });
          return;
        }
        const [{ inspectPdf }, engine] = await Promise.all([loadMerge(), toolEngine()]);
        const found = await inspectPdf(engine, bytes, password);
        if (found.kind === 'ready') {
          patch(id, {
            bytes,
            state: {
              kind: 'ready',
              pageCount: found.pageCount,
              thumbnail: found.thumbnail,
              signed: found.signed,
              ...(password ? { password } : {}),
            },
          });
        } else if (found.kind === 'locked') {
          patch(id, { bytes, state: { kind: 'locked', incorrect: false, trying: false } });
        } else {
          patch(id, { state: { kind: 'unreadable' } });
        }
      } catch {
        patch(id, { state: { kind: 'unreadable' } });
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (files: File[], password?: string) => {
      if (phaseRef.current.kind !== 'edit') return;
      const added = files.map((file) => ({
        entry: {
          id: newId(),
          name: file.name,
          size: file.size,
          bytes: null,
          state: { kind: 'reading' },
          pages: null,
        } satisfies Entry,
        file,
      }));
      setEntries((current) => [...current, ...added.map(({ entry }) => entry)]);
      setFailure(null);
      setAnnouncement(`${added.length} ${added.length === 1 ? 'file' : 'files'} added.`);
      for (const { entry, file } of added) {
        readQueue.current = readQueue.current.then(() => read(entry.id, file, password));
      }
    },
    [read],
  );

  // A file the last tool handed over is the first file of the merge.
  const [handed] = useState<HandedFile | null>(peekHandedFile);
  const tookHanded = useRef(false);
  useEffect(() => {
    if (!handed || tookHanded.current) return;
    tookHanded.current = true;
    addFiles(
      [new File([handed.bytes as BlobPart], handed.name, { type: 'application/pdf' })],
      handed.password,
    );
    clearHandedFile(handed);
  }, [handed, addFiles]);

  const dragging = useWindowFileDrop(addFiles, phase.kind === 'edit');
  const picker = useFilePicker((files) => addFiles(files));

  const remove = (id: string) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry) revokeThumbnail(entry);
    if (picking === id) setPicking(null);
    setEntries((current) => current.filter((candidate) => candidate.id !== id));
    if (entry) setAnnouncement(`${entry.name} removed.`);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= entries.length || from === to) return;
    const moved = entries[from]!;
    setEntries(moveItem(entries, from, to));
    setAnnouncement(`${moved.name} moved to position ${to + 1} of ${entries.length}.`);
  };

  const unlock = async (id: string, password: string) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry?.bytes || !password) return;
    patch(id, { state: { kind: 'locked', incorrect: false, trying: true } });
    const [{ inspectPdf }, engine] = await Promise.all([loadMerge(), toolEngine()]);
    const found = await inspectPdf(engine, entry.bytes, password);
    if (found.kind === 'ready') {
      patch(id, {
        state: {
          kind: 'ready',
          pageCount: found.pageCount,
          thumbnail: found.thumbnail,
          signed: found.signed,
          password,
        },
      });
    } else {
      patch(id, { state: { kind: 'locked', incorrect: true, trying: false } });
    }
  };

  const ready = entries.filter(isReady);
  // The files that put pages into the merge: ready, with at least one page chosen.
  const included = ready.filter((entry) => chosenCount(entry) > 0);
  const reading = entries.filter((entry) => entry.state.kind === 'reading');
  const locked = entries.filter((entry) => entry.state.kind === 'locked');
  const leftOut = entries.filter(
    (entry) => entry.state.kind === 'not-pdf' || entry.state.kind === 'unreadable',
  );
  const noPages = ready.filter((entry) => chosenCount(entry) === 0);
  const totalPages = included.reduce((sum, entry) => sum + chosenCount(entry), 0);
  // One file with some of its pages chosen is a merge too: those pages, as a new PDF.
  const onePart = included.length === 1 && included[0]!.pages !== null;
  const canMerge = (included.length >= 2 || onePart) && reading.length === 0 && locked.length === 0;
  const totalBytes = included.reduce((sum, entry) => sum + entry.size, 0);

  const setPages = (entry: ReadyEntry, pages: readonly number[] | null) =>
    setEntries((current) =>
      current.map((candidate) => (candidate.id === entry.id ? { ...candidate, pages } : candidate)),
    );

  const merge = async () => {
    if (!canMerge) return;
    setPicking(null);
    const files = included.map((entry) => ({
      name: entry.name,
      bytes: entry.bytes!,
      password: entry.state.password,
      pages: entry.pages ?? undefined,
    }));
    setFailure(null);
    setPhase({ kind: 'merging', done: 0, total: files.length });
    try {
      const [{ mergePdfs }, engine] = await Promise.all([loadMerge(), toolEngine()]);
      const result = await mergePdfs(engine, files, { bookmarkEachFile }, (done) =>
        setPhase({ kind: 'merging', done, total: files.length }),
      );
      const file = savedFile(result.bytes, outputFileName(fileName));
      setPhase({ kind: 'done', file, pageCount: result.pageCount });
      setAnnouncement(`Merged. ${file.name} is downloading.`);
      saveFile(file);
    } catch (error) {
      console.error('Merging failed', error);
      setPhase({ kind: 'edit' });
      setFailure(
        'The files couldn’t be merged. Try again, or remove the last file you added to see if it’s the cause.',
      );
    }
  };

  const backToFiles = () => {
    if (phase.kind === 'done' || phase.kind === 'organize') URL.revokeObjectURL(phase.file.url);
    setPhase({ kind: 'edit' });
  };

  const startOver = () => {
    backToFiles();
    entries.forEach(revokeThumbnail);
    setEntries([]);
    setFileName('merged');
  };

  // Rows follow the pointer while one is dragged by its handle; the rows it passes make room.
  // Rows differ in height (an open page picker, a password form), so where it lands is read from
  // the middles of the other rows, measured when the drag starts.
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; slot: number } | null>(
    null,
  );
  const dragStart = useRef<{ y: number; middles: number[] } | null>(null);

  const onHandleDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || entries.length < 2) return;
    const row = event.currentTarget.closest('li');
    if (!row?.parentElement) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const middles = Array.from(row.parentElement.children, (child) => {
      const box = child.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    dragStart.current = { y: event.clientY, middles };
    setDrag({ from: index, to: index, dy: 0, slot: row.offsetHeight + ROW_GAP });
  };
  const onHandleMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || !dragStart.current) return;
    const { y, middles } = dragStart.current;
    const dy = event.clientY - y;
    const centre = middles[drag.from]! + dy;
    const to = middles.filter((middle, index) => index !== drag.from && middle < centre).length;
    setDrag({ ...drag, dy, to });
  };
  const onHandleUp = () => {
    if (drag) move(drag.from, drag.to);
    dragStart.current = null;
    setDrag(null);
  };
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, index + 1);
    }
  };

  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (index === drag.from) {
      return { transform: `translateY(${drag.dy}px)`, transition: 'none', zIndex: 2 };
    }
    if (drag.from < drag.to && index > drag.from && index <= drag.to) {
      return { transform: `translateY(${-drag.slot}px)` };
    }
    if (drag.from > drag.to && index >= drag.to && index < drag.from) {
      return { transform: `translateY(${drag.slot}px)` };
    }
    return undefined;
  };

  const live = (
    <p aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (phase.kind === 'organize') {
    const downloadEdited = async () => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      setSavingEdits(true);
      try {
        const file = savedFile(await viewer.documents.download(), phase.file.name);
        if (edited.current) URL.revokeObjectURL(edited.current.url);
        edited.current = file;
        saveFile(file);
        setAnnouncement(`${file.name} is downloading.`);
      } catch (error) {
        console.error('Saving the rearranged pages failed', error);
        setAnnouncement('The download didn’t work. Try again.');
      } finally {
        setSavingEdits(false);
      }
    };
    return (
      <div data-tool-wide className="flex flex-col gap-3">
        {live}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPhase({ ...phase, kind: 'done' })}
            className={SECONDARY_BUTTON}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2.2} />
            Back
          </button>
          <p className="text-ep-muted m-0 min-w-0 flex-1 basis-[240px] font-sans text-sm">
            Drag pages to move them, or select pages to rotate or delete them. Download saves your
            changes.
          </p>
          <button
            type="button"
            onClick={() => void downloadEdited()}
            disabled={savingEdits}
            className="bg-ep-blue hover:bg-ep-blue600 focus-visible:outline-ep-blue inline-flex h-10 items-center gap-2 rounded-[10px] px-4 font-sans text-sm font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            <HugeiconsIcon icon={Download04Icon} size={18} strokeWidth={2.2} />
            {savingEdits ? 'Saving…' : 'Download'}
          </button>
        </div>
        <div className="border-ep-border h-[min(78svh,820px)] min-h-[480px] overflow-hidden rounded-2xl border">
          <ToolViewer
            name={phase.file.name}
            bytes={phase.file.bytes}
            disable={ORGANIZE_DISABLED}
            panel="thumbnails"
            onViewer={(viewer) => {
              viewerRef.current = viewer;
            }}
          />
        </div>
      </div>
    );
  }

  if (phase.kind === 'done') {
    return (
      <div className="flex flex-col items-center px-4 py-[clamp(32px,5vw,56px)] text-center">
        {live}
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F7EE] text-[#15803D]">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={34} strokeWidth={2} />
        </span>
        <h2 className="font-display text-ep-navy mb-2 mt-5 text-[clamp(24px,3vw,30px)] font-extrabold">
          Your PDF is ready
        </h2>
        <p className="text-ep-muted m-0 max-w-[520px] font-sans text-[15.5px] leading-[1.6]">
          <span className="text-ep-navy font-semibold">{phase.file.name}</span>,{' '}
          {pageCountLabel(phase.pageCount)}, {formatSize(phase.file.size)}. It’s downloading now; if
          it didn’t start, press Download.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => saveFile(phase.file)}
            className="bg-ep-blue hover:bg-ep-blue600 focus-visible:outline-ep-blue inline-flex h-[50px] items-center gap-2.5 rounded-[10px] px-[22px] font-sans text-base font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-[3px]"
          >
            <HugeiconsIcon icon={Download04Icon} size={20} strokeWidth={2.2} />
            Download
          </button>
          <button
            type="button"
            onClick={() => setPhase({ ...phase, kind: 'organize' })}
            className="border-ep-blue text-ep-blue focus-visible:outline-ep-blue inline-flex h-[50px] items-center gap-2.5 rounded-[10px] border-2 px-[22px] font-sans text-base font-bold transition-colors hover:bg-[rgba(8,118,253,0.08)] focus-visible:outline-2 focus-visible:outline-offset-[3px]"
          >
            <HugeiconsIcon icon={LayoutGridIcon} size={20} strokeWidth={2.2} />
            Rearrange pages
          </button>
        </div>
        <div className="text-ep-soft mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 font-sans text-sm">
          <button
            type="button"
            onClick={backToFiles}
            className="hover:text-ep-blue font-semibold underline-offset-2 hover:underline"
          >
            Change the files
          </button>
          <button
            type="button"
            onClick={startOver}
            className="hover:text-ep-blue font-semibold underline-offset-2 hover:underline"
          >
            Merge other PDFs
          </button>
        </div>
        <div className="mt-9">
          <NextSteps file={{ name: phase.file.name, bytes: phase.file.bytes }} from="pdf-merge" />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        {live}
        {picker.input}
        <DropOverlay visible={dragging} label="Drop to add your PDFs" />
        <DropZone {...MERGE_COPY.drop} onChoose={picker.open} />
      </>
    );
  }

  const merging = phase.kind === 'merging';
  const hint = merging
    ? null
    : reading.length > 0
      ? `Reading ${reading[0]!.name}…`
      : locked.length > 0
        ? `${locked[0]!.name} needs its password before it can be merged. Enter it, or remove the file.`
        : included.length === 0
          ? 'Choose at least one page to merge.'
          : !canMerge
            ? ready.length === 1 && ready[0]!.state.pageCount > 1
              ? 'Add one more PDF to merge, or choose pages to keep from this one.'
              : 'Add one more PDF to merge.'
            : leftOut.length + noPages.length > 0
              ? `${leftOut.length + noPages.length === 1 ? 'One file' : `${leftOut.length + noPages.length} files`} will be left out.`
              : null;

  const mergeLabel = merging
    ? `Merging ${Math.min(phase.done + 1, phase.total)} of ${phase.total}…`
    : !canMerge
      ? 'Merge PDFs'
      : onePart
        ? `Save ${pageCountLabel(totalPages)} as a PDF`
        : `Merge ${included.length} PDFs`;

  return (
    <div className="flex flex-col">
      {live}
      {picker.input}
      <DropOverlay visible={dragging} label="Drop to add more PDFs" />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4">
        <p className="text-ep-muted m-0 font-sans text-sm">
          <span className="text-ep-navy font-bold">
            {entries.length} {entries.length === 1 ? 'file' : 'files'}
          </span>
          {totalPages > 0 && `, ${pageCountLabel(totalPages)}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={merging || entries.length < 2}
            onClick={() => {
              setEntries(sortByName(entries));
              setAnnouncement('Files sorted by name.');
            }}
          >
            <HugeiconsIcon icon={SortingAZ01Icon} size={16} strokeWidth={2.2} />
            Sort by name
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={merging}
            onClick={picker.open}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2.4} />
            Add PDFs
          </button>
        </div>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Files to merge, in order">
        {entries.map((entry, index) => (
          <FileRow
            key={entry.id}
            entry={entry}
            index={index}
            count={entries.length}
            disabled={merging}
            dragged={drag?.from === index}
            picking={picking === entry.id}
            style={rowStyle(index)}
            onUp={() => move(index, index - 1)}
            onDown={() => move(index, index + 1)}
            onRemove={() => remove(entry.id)}
            onUnlock={(password) => void unlock(entry.id, password)}
            onPick={(open) => setPicking(open ? entry.id : null)}
            onPages={(pages) => {
              if (isReady(entry)) setPages(entry, pages);
            }}
            handle={{
              onPointerDown: (event) => onHandleDown(event, index),
              onPointerMove: onHandleMove,
              onPointerUp: onHandleUp,
              onPointerCancel: onHandleUp,
              onKeyDown: (event) => onHandleKey(event, index),
            }}
          />
        ))}
      </ol>

      <button
        type="button"
        onClick={picker.open}
        disabled={merging}
        className="border-ep-mistDeep text-ep-blue hover:border-ep-blue hover:bg-ep-tint focus-visible:outline-ep-blue mt-2.5 flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed font-sans text-sm font-bold transition-colors focus-visible:outline-2 disabled:opacity-50"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={18} strokeWidth={2.4} />
        Add more PDFs, or drop them anywhere on the page
      </button>

      <div className="mt-5 flex flex-col gap-3 px-1 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between">
        <label className="text-ep-ink flex cursor-pointer items-start gap-2.5 font-sans text-sm">
          <input
            type="checkbox"
            checked={bookmarkEachFile}
            disabled={merging}
            onChange={(event) => setBookmarkEachFile(event.target.checked)}
            className="accent-ep-blue mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-semibold">Add a bookmark for each file</span>
            <span className="text-ep-soft block">Readers can jump to where each file starts.</span>
          </span>
        </label>
        <label className="text-ep-ink flex items-center gap-2.5 font-sans text-sm">
          <span className="font-semibold">Save as</span>
          <span className="border-ep-border focus-within:border-ep-blue flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-lg border bg-white min-[761px]:flex-none">
            <input
              type="text"
              value={fileName}
              disabled={merging}
              onChange={(event) => setFileName(event.target.value)}
              className="text-ep-navy h-full w-full min-w-0 bg-transparent px-2.5 font-sans text-sm outline-none min-[761px]:w-[220px]"
              aria-label="File name for the merged PDF"
            />
            <span className="text-ep-soft bg-ep-tint border-ep-border flex h-full items-center border-l px-2.5">
              .pdf
            </span>
          </span>
        </label>
      </div>

      {totalBytes > PHONE_MEMORY_HINT &&
        typeof navigator !== 'undefined' &&
        isApplePhoneOrTablet() && (
          <p className="text-ep-soft m-0 mt-3 px-1 font-sans text-[13px]">
            That’s a lot for a phone or tablet. If the page reloads while merging, merge fewer files
            at a time.
          </p>
        )}

      {/* Only the button and what it waits for stay in reach while the list scrolls. */}
      <div className="border-ep-border sticky bottom-0 z-[3] -mx-[clamp(14px,2.2vw,24px)] -mb-[clamp(14px,2.2vw,24px)] mt-4 rounded-b-[22px] border-t bg-white/95 px-[clamp(14px,2.2vw,24px)] py-3.5 backdrop-blur">
        <div className="flex flex-col-reverse gap-2 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-end min-[761px]:gap-4">
          {hint && (
            <p className="text-ep-soft m-0 font-sans text-[13px] leading-[1.45] min-[761px]:max-w-[420px] min-[761px]:text-right">
              {hint}
            </p>
          )}
          <button
            type="button"
            onClick={() => void merge()}
            disabled={!canMerge || merging}
            className="bg-ep-blue hover:bg-ep-blue600 focus-visible:outline-ep-blue disabled:bg-ep-faint inline-flex h-[52px] flex-shrink-0 items-center justify-center gap-2.5 rounded-[10px] px-7 font-sans text-base font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-[3px] disabled:cursor-not-allowed"
          >
            {merging && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {mergeLabel}
          </button>
        </div>
        {failure && (
          <p
            role="alert"
            className="m-0 mt-3 flex items-start gap-2 font-sans text-sm text-[#B42318]"
          >
            <HugeiconsIcon
              icon={Alert02Icon}
              size={18}
              strokeWidth={2}
              className="mt-px flex-shrink-0"
            />
            {failure}
          </p>
        )}
      </div>
    </div>
  );
}
