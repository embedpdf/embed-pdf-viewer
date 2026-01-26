import { EmbedPdfPointerEvent, PointerEventHandlers } from './types';

export function mergeHandlers(list: PointerEventHandlers[]): PointerEventHandlers {
  const keys: (keyof PointerEventHandlers)[] = [
    'onPointerDown',
    'onPointerUp',
    'onPointerMove',
    'onPointerEnter',
    'onPointerLeave',
    'onPointerCancel',
    'onMouseDown',
    'onMouseUp',
    'onMouseMove',
    'onMouseEnter',
    'onMouseLeave',
    'onMouseCancel',
    'onClick',
    'onDoubleClick',
  ];
  const out: Partial<PointerEventHandlers> = {};
  for (const k of keys) {
    out[k] = (pos: any, evt: EmbedPdfPointerEvent, modeId: string) => {
      for (const h of list) {
        // Stop calling handlers if propagation was stopped
        if (evt.isImmediatePropagationStopped()) break;
        h[k]?.(pos, evt, modeId);
      }
    };
  }
  return out as PointerEventHandlers;
}
