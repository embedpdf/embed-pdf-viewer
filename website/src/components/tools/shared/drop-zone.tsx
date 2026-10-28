'use client';

import { FileAddIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

/**
 * Files dropped anywhere on the page go to `onFiles`, not just onto the box: people drop where
 * they happen to let go. `dragging` is true while files are held over the page, for the overlay.
 * Off (`enabled: false`), the browser handles drops itself again.
 */
export function useWindowFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    // dragenter and dragleave fire for every element crossed; the count says when the drag
    // has left the window itself.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) latest.current(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      setDragging(false);
    };
  }, [enabled]);

  return dragging;
}

/** A hidden file input and the call that opens it. */
export function useFilePicker(
  onFiles: (files: File[]) => void,
  {
    accept = 'application/pdf,.pdf',
    multiple = true,
  }: { accept?: string; multiple?: boolean } = {},
): { open: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null);
  const open = useCallback(() => ref.current?.click(), []);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        // Cleared, so choosing the same file again still counts as a change.
        event.target.value = '';
        if (files.length > 0) onFiles(files);
      }}
    />
  );
  return { open, input };
}

/** What shows over the page while files are held over it. */
export function DropOverlay({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,32,76,0.18)] p-4 backdrop-blur-[2px]">
      <div className="border-ep-blue flex h-full w-full items-center justify-center rounded-[24px] border-[3px] border-dashed bg-[rgba(236,242,254,0.9)]">
        <div className="text-ep-navy font-display flex flex-col items-center gap-3 text-center text-[clamp(22px,3vw,30px)] font-extrabold">
          <span className="bg-ep-blue inline-flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-[0_12px_28px_-10px_rgba(8,118,253,0.6)]">
            <HugeiconsIcon icon={FileAddIcon} size={30} strokeWidth={2} />
          </span>
          {label}
        </div>
      </div>
    </div>
  );
}

/**
 * The empty tool: one big target that says what to do. A click anywhere on it chooses files;
 * dropping works on the whole page (`useWindowFileDrop`).
 */
export function DropZone({
  title,
  button,
  hint,
  onChoose,
}: {
  title: string;
  button: string;
  hint: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="border-ep-mistDeep bg-ep-tint hover:border-ep-blue focus-visible:outline-ep-blue group flex min-h-[clamp(260px,34vw,340px)] w-full flex-col items-center justify-center gap-4 rounded-[18px] border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 hover:bg-[#EEF4FE] focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="bg-ep-blue inline-flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-[0_12px_28px_-10px_rgba(8,118,253,0.6)] transition-transform duration-150 group-hover:-translate-y-0.5">
        <HugeiconsIcon icon={FileAddIcon} size={30} strokeWidth={2} />
      </span>
      <span className="font-display text-ep-navy text-[clamp(20px,2.4vw,26px)] font-extrabold leading-tight">
        {title}
      </span>
      <span className="bg-ep-blue group-hover:bg-ep-blue600 inline-flex h-[50px] items-center rounded-[10px] px-[22px] font-sans text-base font-bold text-white transition-colors">
        {button}
      </span>
      <span className="text-ep-soft max-w-[420px] font-sans text-sm leading-[1.55]">{hint}</span>
    </button>
  );
}
