/**
 * Why a key did nothing, said in a short, polite notice that goes away by
 * itself: a shortcut whose command is turned off or not allowed, or Ctrl/Cmd+C
 * on text the user may not copy. Screen readers hear it through a live region,
 * which stays mounted so every new message is announced.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CommandId, CommandRefusal } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';

/** How long a notice stays. */
const NOTICE_MS = 2500;

export interface RefusalNotice {
  /** The notice, mounted once inside a positioned box of the viewer. */
  readonly element: ReactNode;
  /** For `useCommandShortcuts({ onRefused })`. */
  readonly onShortcutRefused: (commandId: CommandId, refusal: CommandRefusal) => void;
  /** For `<SelectionClipboard onRefused>`. */
  readonly onCopyRefused: () => void;
}

export function useRefusalNotice(): RefusalNotice {
  const t = useT();
  // `count` tells two equal messages apart: the second one is announced and timed again.
  const [notice, setNotice] = useState<{ message: string; count: number } | null>(null);
  const show = useCallback(
    (message: string) => setNotice((previous) => ({ message, count: (previous?.count ?? 0) + 1 })),
    [],
  );

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const onShortcutRefused = useCallback(
    (_commandId: CommandId, refusal: CommandRefusal) => show(refusal.message),
    [show],
  );
  const onCopyRefused = useCallback(
    () => show(t('commands.notAllowed.doc-text-copy', { fallback: "Copying isn't allowed" })),
    [show, t],
  );

  return {
    onShortcutRefused,
    onCopyRefused,
    element: (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center"
      >
        {notice && (
          <div
            key={notice.count}
            className="border-border-subtle bg-elevated/95 text-fg rounded-full border px-4 py-1.5 text-sm shadow-lg backdrop-blur"
          >
            {notice.message}
          </div>
        )}
      </div>
    ),
  };
}
