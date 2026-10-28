'use client';

import type { DocumentHandle } from '@embedpdf/engine';
import { Alert02Icon, Pdf02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { DropOverlay, DropZone, useFilePicker, useWindowFileDrop } from './drop-zone';
import { toolEngine, useWarmEngine } from './engine';
import { formatSize, looksLikePdf, pageCountLabel } from './files';
import { clearHandedFile, peekHandedFile, type HandedFile } from './handoff';
import { UnlockForm } from './unlock-form';

/** The engine side, loaded with the engine: the page itself ships without either. */
const loadOpenPdf = () => import('./open-pdf');

/** The file a single-file tool works on, once it's open. */
export interface OpenFile {
  readonly name: string;
  readonly size: number;
  readonly bytes: Uint8Array;
  readonly password?: string;
  readonly pageCount: number;
  readonly signed: boolean;
  /**
   * The open document, for a tool that works on it; it's closed when the file goes. `null` for a
   * tool that shows the file in the viewer, which opens its own.
   */
  readonly doc: DocumentHandle | null;
}

type State =
  | { readonly kind: 'empty' }
  | { readonly kind: 'opening'; readonly name: string }
  | {
      readonly kind: 'locked';
      readonly name: string;
      readonly bytes: Uint8Array;
      readonly incorrect: boolean;
      readonly trying: boolean;
    }
  | { readonly kind: 'refused'; readonly name: string; readonly reason: 'not-pdf' | 'unreadable' }
  | { readonly kind: 'ready'; readonly file: OpenFile };

const SECONDARY_BUTTON =
  'border-ep-border text-ep-navy hover:border-ep-blue hover:text-ep-blue focus-visible:outline-ep-blue inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-[10px] border bg-white px-3.5 font-sans text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="border-ep-mistDeep bg-ep-tint flex min-h-[clamp(220px,28vw,300px)] flex-col items-center justify-center gap-3 rounded-[18px] border-2 border-dashed px-6 py-10 text-center">
      {children}
    </div>
  );
}

/**
 * The start of every tool that works on one PDF: drop or choose it (or take the one the last
 * tool handed over), open it, ask for its password in place, or say plainly why it can't be
 * opened. Once it's open, a bar names the file with a way to use another, and `children` is the
 * tool.
 */
export function SingleFileTool({
  drop,
  keepOpen = true,
  children,
}: {
  drop: { readonly title: string; readonly button: string; readonly hint: string };
  /** Keep the document open for the tool (`doc`); off for a tool that shows it in the viewer. */
  keepOpen?: boolean;
  children: (file: OpenFile) => ReactNode;
}) {
  useWarmEngine();
  const [state, setState] = useState<State>({ kind: 'empty' });
  // Each open gets a number: a result for an older one (the user changed files meanwhile) is
  // dropped, and its document closed.
  const attempt = useRef(0);
  const current = useRef<DocumentHandle | null>(null);

  const closeCurrent = () => {
    void current.current?.close().catch(() => {});
    current.current = null;
  };

  const open = useCallback(
    async (name: string, bytes: Uint8Array, size: number, password?: string) => {
      const mine = ++attempt.current;
      if (!looksLikePdf(bytes)) {
        setState({ kind: 'refused', name, reason: 'not-pdf' });
        return;
      }
      const [{ openPdf }, engine] = await Promise.all([loadOpenPdf(), toolEngine()]);
      const opened = await openPdf(engine, bytes, password);
      if (mine !== attempt.current) {
        if (opened.kind === 'ready') void opened.doc.close().catch(() => {});
        return;
      }
      if (opened.kind === 'locked') {
        setState({ kind: 'locked', name, bytes, incorrect: opened.incorrect, trying: false });
      } else if (opened.kind === 'unreadable') {
        setState({ kind: 'refused', name, reason: 'unreadable' });
      } else {
        if (!keepOpen) void opened.doc.close().catch(() => {});
        current.current = keepOpen ? opened.doc : null;
        const { pageCount, signed } = opened;
        const doc = keepOpen ? opened.doc : null;
        setState({
          kind: 'ready',
          file: { name, size, bytes, password, pageCount, signed, doc },
        });
      }
    },
    [keepOpen],
  );

  const take = useCallback(
    async (files: File[]) => {
      const [file] = files;
      if (!file) return;
      closeCurrent();
      setState({ kind: 'opening', name: file.name });
      try {
        await open(file.name, new Uint8Array(await file.arrayBuffer()), file.size);
      } catch {
        setState({ kind: 'refused', name: file.name, reason: 'unreadable' });
      }
    },
    [open],
  );

  // A file the last tool handed over starts this one.
  const [handed] = useState<HandedFile | null>(peekHandedFile);
  useEffect(() => {
    if (!handed) return;
    setState({ kind: 'opening', name: handed.name });
    void open(handed.name, handed.bytes, handed.bytes.byteLength, handed.password).then(() =>
      clearHandedFile(handed),
    );
    return () => {
      attempt.current++;
      closeCurrent();
    };
  }, [handed, open]);

  useEffect(() => () => closeCurrent(), []);

  const ready = state.kind === 'ready';
  const dragging = useWindowFileDrop((files) => void take(files), !ready);
  const picker = useFilePicker((files) => void take(files), { multiple: false });

  const useAnother = () => {
    closeCurrent();
    attempt.current++;
    setState({ kind: 'empty' });
    picker.open();
  };

  const unlock = async (password: string) => {
    if (state.kind !== 'locked') return;
    setState({ ...state, trying: true });
    await open(state.name, state.bytes, state.bytes.byteLength, password);
  };

  if (state.kind === 'ready') {
    const { file } = state;
    return (
      <div className="flex flex-col gap-4">
        {picker.input}
        <div className="border-ep-border bg-ep-bg flex flex-wrap items-center gap-3 rounded-2xl border p-3">
          <span className="bg-ep-mist text-ep-blue inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
            <HugeiconsIcon icon={Pdf02Icon} size={22} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 basis-[180px]">
            <p
              className="text-ep-navy m-0 truncate font-sans text-[15px] font-bold"
              title={file.name}
            >
              {file.name}
            </p>
            <p className="text-ep-soft m-0 font-sans text-[13px]">
              {pageCountLabel(file.pageCount)}, {formatSize(file.size)}
              {file.signed && ', signed'}
              {file.password && ', has a password'}
            </p>
          </div>
          <button type="button" onClick={useAnother} className={SECONDARY_BUTTON}>
            Use another file
          </button>
        </div>
        {children(file)}
      </div>
    );
  }

  return (
    <>
      {picker.input}
      <DropOverlay visible={dragging} label="Drop to open your PDF" />
      {state.kind === 'empty' && (
        <DropZone title={drop.title} button={drop.button} hint={drop.hint} onChoose={picker.open} />
      )}
      {state.kind === 'opening' && (
        <Card>
          <span className="border-ep-mistDeep border-t-ep-blue h-6 w-6 animate-spin rounded-full border-2" />
          <p className="text-ep-muted m-0 font-sans text-sm">Opening {state.name}…</p>
        </Card>
      )}
      {state.kind === 'locked' && (
        <Card>
          <p className="text-ep-navy m-0 font-sans text-[15px] font-bold">{state.name}</p>
          <UnlockForm
            state={state}
            name={state.name}
            purpose="This PDF has a password. Enter it to open the file."
            onUnlock={(password) => void unlock(password)}
          />
          <button
            type="button"
            onClick={picker.open}
            className="text-ep-blue mt-1 font-sans text-sm font-bold hover:underline"
          >
            Choose another file
          </button>
        </Card>
      )}
      {state.kind === 'refused' && (
        <Card>
          <HugeiconsIcon icon={Alert02Icon} size={28} strokeWidth={2} className="text-[#B42318]" />
          <p className="text-ep-navy m-0 font-sans text-[15px] font-bold">{state.name}</p>
          <p className="text-ep-muted m-0 max-w-[420px] font-sans text-sm">
            {state.reason === 'not-pdf'
              ? 'This isn’t a PDF. Choose a PDF file to continue.'
              : 'This PDF can’t be opened. It may be damaged.'}
          </p>
          <button type="button" onClick={picker.open} className={SECONDARY_BUTTON}>
            Choose another file
          </button>
        </Card>
      )}
    </>
  );
}
