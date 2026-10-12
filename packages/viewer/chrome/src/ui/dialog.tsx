/**
 * A dialog: centered in the viewer's box over the dimmed viewer, in the layer
 * over it (`viewer-layer.ts`), so it covers the viewer and never the page
 * around it, and sits above a sheet or a panel it opened from. It takes focus
 * when it opens (its first control), keeps Tab inside it, closes on Escape
 * and gives focus back to what opened it.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { SCRIM_CLASS } from './sheet';
import { POPOVER, attachViewerLayer, holdFocus } from './viewer-layer';

export interface DialogProps {
  /** The id of the dialog's title, which names it for assistive technology. */
  readonly labelledBy: string;
  /** What Escape does: close the dialog, or nothing while it's busy. */
  readonly onClose: () => void;
  /** The dialog's own box: its border, background, width and padding. */
  readonly className: string;
  readonly children: ReactNode;
}

export function Dialog({ labelledBy, onClose, className, children }: DialogProps) {
  const layer = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const layerElement = layer.current;
    const panelElement = panel.current;
    if (!layerElement || !panelElement) return;
    const stopLayer = attachViewerLayer(layerElement);
    const held = holdFocus(panelElement, { onEscape: () => close.current() });
    return () => {
      held.release();
      stopLayer();
    };
    // The dialog opens once; it closes by unmounting.
  }, []);
  return (
    <div
      ref={layer}
      {...POPOVER}
      data-epdf-layer=""
      className="text-fg m-0 place-items-center overflow-hidden border-0 bg-transparent p-4 open:grid"
      style={{ position: 'fixed', inset: 'auto', maxWidth: 'none', maxHeight: 'none' }}
    >
      <div aria-hidden="true" className={`absolute inset-0 ${SCRIM_CLASS}`} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative max-h-full max-w-full overflow-y-auto ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
