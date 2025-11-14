import { Position } from '@embedpdf/models';
import type {
  InteractionManagerCapability,
  InteractionScope,
  PointerEventHandlers,
  EmbedPdfPointerEvent,
  InteractionExclusionRules,
} from '@embedpdf/plugin-interaction-manager';

/* -------------------------------------------------- */
/* event → handler key lookup                         */
/* -------------------------------------------------- */
type K = keyof PointerEventHandlers;
const domEventMap: Record<string, K> = {
  pointerdown: 'onPointerDown',
  pointerup: 'onPointerUp',
  pointermove: 'onPointerMove',
  pointerenter: 'onPointerEnter',
  pointerleave: 'onPointerLeave',
  pointercancel: 'onPointerCancel',

  mousedown: 'onMouseDown',
  mouseup: 'onMouseUp',
  mousemove: 'onMouseMove',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  mousecancel: 'onMouseCancel',

  click: 'onClick',
  dblclick: 'onDoubleClick',

  /* touch → pointer fallback for very old browsers */
  touchstart: 'onPointerDown',
  touchend: 'onPointerUp',
  touchmove: 'onPointerMove',
  touchcancel: 'onPointerCancel',
};

const pointerEventTypes = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerenter',
  'pointerleave',
  'pointercancel',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mousecancel',
  'click',
  'dblclick',
];

const touchEventTypes = ['touchstart', 'touchend', 'touchmove', 'touchcancel'];
const HAS_POINTER = typeof PointerEvent !== 'undefined';
// If the browser supports Pointer Events, don't attach legacy touch events to avoid double-dispatch.
const allEventTypes = HAS_POINTER ? pointerEventTypes : [...pointerEventTypes, ...touchEventTypes];

/* -------------------------------------------------- */
/* helper: decide listener options per event type     */
/* -------------------------------------------------- */
function listenerOpts(eventType: string, wantsRawTouch: boolean): AddEventListenerOptions {
  // Only touch events are toggled; pointer/mouse stay non-passive
  return eventType.startsWith('touch') ? { passive: !wantsRawTouch } : { passive: false };
}

function isTouchEvent(evt: Event): evt is TouchEvent {
  return typeof TouchEvent !== 'undefined' && evt instanceof TouchEvent;
}

/**
 * Check if an element should be excluded based on rules
 * This is in the framework layer, not the plugin
 */
function shouldExcludeElement(element: Element | null, rules: InteractionExclusionRules): boolean {
  if (!element) return false;

  let current: Element | null = element;

  while (current) {
    // Check classes
    if (rules.classes?.length) {
      for (const className of rules.classes) {
        if (current.classList?.contains(className)) {
          return true;
        }
      }
    }

    // Check data attributes
    if (rules.dataAttributes?.length) {
      for (const attr of rules.dataAttributes) {
        if (current.hasAttribute(attr)) {
          return true;
        }
      }
    }

    // Move up the DOM tree
    current = current.parentElement;
  }

  return false;
}

/* -------------------------------------------------- */
/* createPointerProvider                              */
/* -------------------------------------------------- */
export function createPointerProvider(
  cap: InteractionManagerCapability,
  scope: InteractionScope,
  element: HTMLElement,
  convertEventToPoint?: (evt: PointerEvent, host: HTMLElement) => Position,
) {
  const capScope = cap.forDocument(scope.documentId);
  /* ---------- live handler set --------------------------------------------------- */
  let active: PointerEventHandlers | null = cap.getHandlersForScope(scope);

  /* ---------- helper to compute current wantsRawTouch (defaults to true) --------- */
  const wantsRawTouchNow = () => capScope.getActiveInteractionMode()?.wantsRawTouch !== false; // default → true

  /* ---------- dynamic listener (re)attachment ------------------------------------ */
  const listeners: Record<string, (evt: Event) => void> = {};
  let attachedWithRawTouch = wantsRawTouchNow(); // remember current mode’s wish

  const addListeners = (raw: boolean) => {
    allEventTypes.forEach((type) => {
      const fn = (listeners[type] ??= handleEvent);
      element.addEventListener(type, fn, listenerOpts(type, raw));
    });
  };
  const removeListeners = () => {
    allEventTypes.forEach((type) => {
      const fn = listeners[type];
      if (fn) element.removeEventListener(type, fn);
    });
  };

  /* attach for the first time */
  addListeners(attachedWithRawTouch);
  element.style.touchAction = attachedWithRawTouch ? 'none' : '';

  /* ---------- mode & handler change hooks --------------------------------------- */
  const stopMode = capScope.onModeChange(() => {
    /* cursor baseline update for global wrapper */
    if (scope.type === 'global') {
      const mode = capScope.getActiveInteractionMode();
      element.style.cursor = mode?.scope === 'global' ? (mode.cursor ?? 'auto') : 'auto';
    }

    active = cap.getHandlersForScope(scope);

    /* re-attach listeners if wantsRawTouch toggled */
    const raw = wantsRawTouchNow();
    if (raw !== attachedWithRawTouch) {
      removeListeners();
      addListeners(raw);
      attachedWithRawTouch = raw;
      element.style.touchAction = attachedWithRawTouch ? 'none' : '';
    }
  });

  const stopHandler = cap.onHandlerChange(() => {
    active = cap.getHandlersForScope(scope);
  });

  /* ---------- cursor sync -------------------------------------------------------- */
  const initialMode = capScope.getActiveInteractionMode();
  const initialCursor = capScope.getCurrentCursor();
  element.style.cursor =
    scope.type === 'global' && initialMode?.scope !== 'global' ? 'auto' : initialCursor;

  const stopCursor = capScope.onCursorChange((c) => {
    if (scope.type === 'global' && capScope.getActiveInteractionMode()?.scope !== 'global') return;
    element.style.cursor = c;
  });

  /* ---------- point conversion --------------------------------------------------- */
  const toPos = (e: { clientX: number; clientY: number }, host: HTMLElement): Position => {
    if (convertEventToPoint) return convertEventToPoint(e as PointerEvent, host);
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* ---------- central event handler --------------------------------------------- */
  function handleEvent(evt: Event) {
    if (cap.isPaused()) return;

    // Get exclusion rules from capability and check in framework layer
    const exclusionRules = cap.getExclusionRules();
    if (evt.target && shouldExcludeElement(evt.target as Element, exclusionRules)) {
      return; // Skip processing this event
    }

    const handlerKey = domEventMap[evt.type];
    if (!handlerKey || !active?.[handlerKey]) return;

    /* preventDefault only when mode really wants raw touch                        */
    if (
      isTouchEvent(evt) &&
      attachedWithRawTouch &&
      (evt.type === 'touchmove' || evt.type === 'touchcancel')
    ) {
      evt.preventDefault();
    }

    // ----- normalise ----------------------------------------------------------------
    let pos!: Position;
    let normEvt!: EmbedPdfPointerEvent & {
      target: EventTarget | null;
      currentTarget: EventTarget | null;
    };

    if (isTouchEvent(evt)) {
      const tp =
        evt.type === 'touchend' || evt.type === 'touchcancel'
          ? evt.changedTouches[0]
          : evt.touches[0];
      if (!tp) return;

      pos = toPos(tp, element);
      normEvt = {
        clientX: tp.clientX,
        clientY: tp.clientY,
        ctrlKey: evt.ctrlKey,
        shiftKey: evt.shiftKey,
        altKey: evt.altKey,
        metaKey: evt.metaKey,
        target: evt.target,
        currentTarget: evt.currentTarget,
        setPointerCapture: () => {},
        releasePointerCapture: () => {},
      };
    } else {
      const pe = evt as PointerEvent;
      pos = toPos(pe, element);
      normEvt = {
        clientX: pe.clientX,
        clientY: pe.clientY,
        ctrlKey: pe.ctrlKey,
        shiftKey: pe.shiftKey,
        altKey: pe.altKey,
        metaKey: pe.metaKey,
        target: pe.target,
        currentTarget: pe.currentTarget,
        setPointerCapture: () => {
          (pe.target as HTMLElement)?.setPointerCapture?.(pe.pointerId);
        },
        releasePointerCapture: () => {
          (pe.target as HTMLElement)?.releasePointerCapture?.(pe.pointerId);
        },
      };
    }

    active[handlerKey]?.(pos, normEvt, capScope.getActiveMode());
  }

  /* ---------- teardown ----------------------------------------------------------- */
  return () => {
    removeListeners();
    stopMode();
    stopCursor();
    stopHandler();
  };
}
