/**
 * Drop a PDF on the viewer to open it as a new tab: the `document:open` command, given the
 * dropped files. While a file is dragged over, a drop target says so. It takes drops only while
 * that command is there (`config/open-files.ts`); a drag of text, of an annotation, or of files
 * that aren't PDFs is left to the page.
 */
import { useCommand, useCommands } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';

import { isPdfFile, mayCarryPdf, OPEN_COMMAND_ID, type OpenFilesArgs } from '../config/open-files';

export function DropToOpen({ className, children }: { className: string; children: ReactNode }) {
  const t = useT();
  const commands = useCommands();
  const open = useCommand(OPEN_COMMAND_ID);
  const available = open.visible && open.enabled;
  // A drag enters and leaves every element it crosses: count them, so the target stays until
  // the drag leaves this box.
  const entered = useRef(0);
  const [over, setOver] = useState(false);

  const takes = (event: DragEvent) => available && mayCarryPdf(event.dataTransfer);
  const reset = () => {
    entered.current = 0;
    setOver(false);
  };

  return (
    <div
      className={className}
      onDragEnter={(event) => {
        if (!takes(event)) return;
        event.preventDefault();
        entered.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!takes(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        if (entered.current === 0) return;
        entered.current -= 1;
        if (entered.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        reset();
        if (!takes(event)) return;
        // A drop this box took is the viewer's: the browser doesn't show the file in place of
        // the page, and the files that aren't PDFs are left out.
        event.preventDefault();
        event.stopPropagation();
        const files = Array.from(event.dataTransfer.files).filter(isPdfFile);
        if (files.length === 0) return;
        const args: OpenFilesArgs = { files };
        // A failing command reports itself through the commands' onExecutionFailed.
        void commands.execute(OPEN_COMMAND_ID, { args }).catch(() => {});
      }}
    >
      {children}
      {over && (
        <div
          data-epdf-drop-target=""
          className="border-accent bg-accent-light/60 pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-lg border-2 border-dashed"
        >
          <span className="bg-elevated text-fg rounded-full px-4 py-1.5 text-sm font-medium shadow-lg">
            {t('dropToOpen.label', { fallback: 'Drop a PDF to open it' })}
          </span>
        </div>
      )}
    </div>
  );
}
