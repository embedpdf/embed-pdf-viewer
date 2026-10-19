/**
 * The Print dialog, which `document:print` opens: every page, the current page or a range of
 * them, and whether annotations print. Nothing is made while the user chooses: Print prepares
 * the printout the choices describe, shows how far that is, and opens the browser's print dialog
 * as soon as it is ready. Safari prints only from a tap, and the one on Print was spent preparing,
 * so there the printout waits for another (`PreparedPrint.needsTap`). Cancel stops it at any
 * point. Form fields always print, each as its own print setting says; annotations follow
 * theirs.
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
import { useEffect, useId, useRef, useState } from 'react';

import { PRINT_DIALOG } from '../config/commands';
import { Dialog } from './dialog';
import { pagesInRange } from './print-pages';

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

/**
 * The printout: not asked for yet, on its way (with how far), ready and waiting for the tap
 * Safari needs, being printed, or failed (the choices show again, to try once more).
 */
type Job =
  | { readonly kind: 'choosing' }
  | { readonly kind: 'preparing'; readonly progress: PrintProgress | null }
  | { readonly kind: 'ready'; readonly prepared: PreparedPrint }
  | { readonly kind: 'printing' }
  | { readonly kind: 'failed' };

/** The printout the dialog holds: cancelled while on its way, freed once made. */
interface HeldPrint {
  readonly cancel: AbortController;
  prepared: PreparedPrint | null;
}

/** Cancel the printout on its way, or free the one made. */
function drop(held: { current: HeldPrint | null }) {
  held.current?.cancel.abort();
  held.current?.prepared?.dispose();
  held.current = null;
}

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
  const [job, setJob] = useState<Job>({ kind: 'choosing' });
  const held = useRef<HeldPrint | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  const quality = documents.getPrintQuality(documentId ?? undefined);
  const chosen = chosenPages(choice, pages, currentIndex, range);

  // Closing the dialog, by Cancel, Escape or a finished print, drops the printout.
  useEffect(() => () => drop(held), []);

  const print = (prepared: PreparedPrint) => {
    setJob({ kind: 'printing' });
    prepared.print().then(onClose, (error: unknown) => {
      console.warn('[embedpdf] print failed', error);
      setJob({ kind: 'failed' });
    });
  };

  const prepare = (pagesToPrint: readonly PageRef[] | undefined) => {
    drop(held);
    const job: HeldPrint = { cancel: new AbortController(), prepared: null };
    const { signal } = job.cancel;
    held.current = job;
    setJob({ kind: 'preparing', progress: null });
    documents
      .preparePrint(documentId ?? undefined, {
        ...(pagesToPrint ? { pages: pagesToPrint } : {}),
        includeAnnotations,
        signal,
        onProgress: (progress) => {
          if (!signal.aborted) setJob({ kind: 'preparing', progress });
        },
      })
      .then(
        (prepared) => {
          if (signal.aborted) return prepared.dispose();
          job.prepared = prepared;
          if (prepared.needsTap) setJob({ kind: 'ready', prepared });
          else print(prepared);
        },
        (error: unknown) => {
          if (signal.aborted) return;
          console.warn('[embedpdf] preparing the printout failed', error);
          setJob({ kind: 'failed' });
        },
      );
  };

  // While the printout is made, the choices give way to its progress: focus goes to Cancel, and
  // to Print once a printout waits for its tap.
  useEffect(() => {
    if (job.kind === 'preparing' && job.progress === null) cancelButton.current?.focus();
    if (job.kind === 'ready') printButton.current?.focus();
  }, [job]);

  const choosing = job.kind === 'choosing' || job.kind === 'failed';
  const status =
    job.kind === 'preparing'
      ? job.progress && job.progress.pagesRendered > 0
        ? t('print.preparingPage', {
            params: {
              page: Math.min(job.progress.pagesRendered + 1, job.progress.pageCount),
              total: job.progress.pageCount,
            },
          })
        : t('print.preparing')
      : job.kind === 'ready'
        ? t('print.ready')
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
        if (job.kind !== 'printing') onClose();
      }}
      className="border-border bg-surface w-96 rounded-lg border p-4 shadow-xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (job.kind === 'ready') print(job.prepared);
          else if (choosing && chosen !== null) prepare(chosen);
        }}
      >
        <h2 id={titleId} className="text-fg text-base font-semibold">
          {t('print.title')}
        </h2>
        {choosing ? (
          <>
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
                    aria-invalid={choice === 'range' && chosen === null}
                    placeholder={t('print.rangePlaceholder')}
                    value={range}
                    onFocus={() => setChoice('range')}
                    onChange={(event) => setRange(event.target.value)}
                    className="border-border bg-surface text-fg focus:border-accent focus:ring-accent min-w-0 flex-1 rounded-md border px-1.5 py-1 text-sm tabular-nums outline-none focus:ring-1 aria-[invalid=true]:border-red-600"
                  />
                </div>
                {choice === 'range' && chosen === null && range.trim() !== '' ? (
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
          </>
        ) : (
          <ProgressBar
            progress={job.kind === 'preparing' ? job.progress : null}
            done={job.kind !== 'preparing'}
          />
        )}
        <p role="status" className="text-fg-muted mt-2 min-h-5 text-sm">
          {status}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            ref={cancelButton}
            type="button"
            disabled={job.kind === 'printing'}
            onClick={onClose}
            className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
          >
            {t('print.cancel')}
          </button>
          <button
            ref={printButton}
            type="submit"
            disabled={choosing ? chosen === null : job.kind !== 'ready'}
            className="bg-accent text-on-accent hover:bg-accent-hover rounded-md px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {t('print.print')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * How far preparing got: the bar moves until the first page is ready (a PDF copy arrives all at
 * once), then fills page by page. Full once the printout is made.
 */
function ProgressBar({ progress, done }: { progress: PrintProgress | null; done: boolean }) {
  const fraction = done
    ? 1
    : progress && progress.pagesRendered > 0
      ? progress.pagesRendered / progress.pageCount
      : null;
  return (
    <div aria-hidden="true" className="bg-hover mt-4 h-1.5 overflow-hidden rounded-full">
      <div
        className={`bg-accent h-full rounded-full transition-[width] ${fraction === null ? 'w-full animate-pulse' : ''}`}
        style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
      />
    </div>
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
