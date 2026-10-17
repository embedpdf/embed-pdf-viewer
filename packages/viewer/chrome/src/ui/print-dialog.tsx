/**
 * The Print dialog, which `document:print` opens: every page, the current page or a range of
 * them, and whether annotations print. It prepares the printout as soon as it opens, and again
 * whenever a choice changes (the old one is cancelled), so its Print button opens the browser's
 * dialog at once: iOS prints only from a tap that opens it directly. Form fields always print,
 * each as its own print setting says; annotations follow theirs.
 */
import { useT } from '@embedpdf/react/i18n';
import {
  useDocumentId,
  useDocuments,
  usePageList,
  type PageInfo,
  type PageRef,
  type PreparedPrint,
  type PrintProgress,
} from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { useStageState } from '@embedpdf/react/stage';
import { useEffect, useId, useState } from 'react';

import { PRINT_DIALOG } from '../config/commands';
import { Dialog } from './dialog';
import { pagesInRange } from './print-pages';

/** How long a typed range rests before the dialog prepares its pages. */
const RANGE_PAUSE_MS = 400;

type PageChoice = 'all' | 'current' | 'range';

/** The pages a choice names: `undefined` for every page, `null` when it names none. */
function chosenPages(
  choice: PageChoice,
  pages: readonly PageInfo[],
  currentIndex: number,
  range: string,
): PageRef[] | undefined | null {
  if (choice === 'all') return undefined;
  if (choice === 'current') {
    const page = pages[currentIndex];
    return page ? [page.ref] : null;
  }
  return pagesInRange(range, pages.length)?.map((page) => pages[page - 1]!.ref) ?? null;
}

/** Where the printout is: on its way (with how far), ready to print, or not possible. */
type Job =
  | { readonly kind: 'preparing'; readonly progress: PrintProgress | null }
  | { readonly kind: 'ready'; readonly prepared: PreparedPrint }
  | { readonly kind: 'invalid-range' }
  | { readonly kind: 'failed' };

export function PrintDialog() {
  const surface = useSurface(PRINT_DIALOG);
  return surface.isOpen ? <PrintForm onClose={surface.close} /> : null;
}

function PrintForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const rangeId = useId();
  const choiceName = useId();
  const documents = useDocuments();
  const documentId = useDocumentId();
  const pages = usePageList();
  const currentIndex = useStageState((state) => state.currentPageIndex);
  const [choice, setChoice] = useState<PageChoice>('all');
  const [range, setRange] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [job, setJob] = useState<Job>({ kind: 'preparing', progress: null });
  const [printing, setPrinting] = useState(false);
  const quality = documents.getPrintQuality(documentId ?? undefined);

  // Prepare the printout the choices describe; a new choice cancels the one on its way and frees
  // the one that was ready.
  useEffect(() => {
    const chosen = chosenPages(choice, pages, currentIndex, range);
    if (chosen === null) {
      setJob({ kind: 'invalid-range' });
      return;
    }
    const cancel = new AbortController();
    let prepared: PreparedPrint | null = null;
    setJob({ kind: 'preparing', progress: null });
    const start = () =>
      documents
        .preparePrint(documentId ?? undefined, {
          ...(chosen ? { pages: chosen } : {}),
          includeAnnotations,
          signal: cancel.signal,
          onProgress: (progress) => {
            if (!cancel.signal.aborted) setJob({ kind: 'preparing', progress });
          },
        })
        .then(
          (ready) => {
            if (cancel.signal.aborted) return ready.dispose();
            prepared = ready;
            setJob({ kind: 'ready', prepared: ready });
          },
          (error: unknown) => {
            if (cancel.signal.aborted) return;
            console.warn('[embedpdf] preparing the printout failed', error);
            setJob({ kind: 'failed' });
          },
        );
    // A typed range waits until typing pauses, so each keystroke doesn't draw pages.
    const timer = setTimeout(start, choice === 'range' ? RANGE_PAUSE_MS : 0);
    return () => {
      clearTimeout(timer);
      cancel.abort();
      prepared?.dispose();
    };
  }, [documents, documentId, pages, currentIndex, choice, range, includeAnnotations]);

  const print = () => {
    if (job.kind !== 'ready') return;
    setPrinting(true);
    job.prepared.print().then(onClose, (error: unknown) => {
      console.warn('[embedpdf] print failed', error);
      setPrinting(false);
      setJob({ kind: 'failed' });
    });
  };

  const status =
    job.kind === 'preparing'
      ? job.progress && job.progress.pageCount > 0
        ? t('print.preparingPage', {
            params: {
              page: Math.min(job.progress.pagesRendered + 1, job.progress.pageCount),
              total: job.progress.pageCount,
            },
          })
        : t('print.preparing')
      : job.kind === 'failed'
        ? t('print.failed')
        : null;
  // Pictures of the pages; a document that allows only low-resolution printing says so.
  const note =
    quality?.kind !== 'images'
      ? null
      : quality.dpi < 300
        ? t('print.lowResolution', { params: { dpi: quality.dpi } })
        : t('print.images', { params: { dpi: quality.dpi } });

  return (
    <Dialog
      labelledBy={titleId}
      onClose={() => {
        if (!printing) onClose();
      }}
      className="border-border bg-surface w-96 rounded-lg border p-4 shadow-xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          print();
        }}
      >
        <h2 id={titleId} className="text-fg text-base font-semibold">
          {t('print.title')}
        </h2>
        <fieldset className="mt-3">
          <legend className="text-fg-secondary text-sm font-medium">{t('print.pages')}</legend>
          <div className="mt-1 flex flex-col gap-1">
            <Choice
              name={choiceName}
              checked={choice === 'all'}
              onChoose={() => setChoice('all')}
              label={t('print.allPages')}
            />
            <Choice
              name={choiceName}
              checked={choice === 'current'}
              onChoose={() => setChoice('current')}
              label={t('print.currentPage')}
            />
            <div className="flex items-center gap-2">
              <Choice
                name={choiceName}
                checked={choice === 'range'}
                onChoose={() => setChoice('range')}
                label={t('print.range')}
                controls={rangeId}
              />
              <input
                id={rangeId}
                type="text"
                inputMode="numeric"
                aria-label={t('print.rangeLabel')}
                aria-invalid={choice === 'range' && job.kind === 'invalid-range'}
                placeholder={t('print.rangePlaceholder')}
                value={range}
                onFocus={() => setChoice('range')}
                onChange={(event) => setRange(event.target.value)}
                className="border-border bg-surface text-fg focus:border-accent focus:ring-accent min-w-0 flex-1 rounded-md border px-1.5 py-1 text-sm tabular-nums outline-none focus:ring-1 aria-[invalid=true]:border-red-600"
              />
            </div>
            {choice === 'range' && job.kind === 'invalid-range' && range.trim() !== '' ? (
              <p className="text-xs text-red-600">
                {t('print.rangeInvalid', { params: { total: pages.length } })}
              </p>
            ) : null}
          </div>
        </fieldset>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-accent"
            checked={includeAnnotations}
            onChange={(event) => setIncludeAnnotations(event.target.checked)}
          />
          <span className="text-fg">{t('print.annotations')}</span>
        </label>
        {note ? <p className="text-fg-muted mt-3 text-xs">{note}</p> : null}
        <p role="status" className="text-fg-muted mt-2 min-h-5 text-sm">
          {status}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={printing}
            onClick={onClose}
            className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
          >
            {t('print.cancel')}
          </button>
          <button
            type="submit"
            disabled={job.kind !== 'ready' || printing}
            className="bg-accent text-on-accent hover:bg-accent-hover rounded-md px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {t('print.print')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Choice({
  name,
  checked,
  onChoose,
  label,
  controls,
}: {
  /** The group's name, so the arrow keys move between its choices. */
  name: string;
  checked: boolean;
  onChoose: () => void;
  label: string;
  /** The field this choice turns on, for assistive technology. */
  controls?: string;
}) {
  return (
    <label className="text-fg flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="radio"
        name={name}
        className="accent-accent"
        checked={checked}
        onChange={onChoose}
        aria-controls={controls}
      />
      {label}
    </label>
  );
}
