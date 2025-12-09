import { h, ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { computePosition, offset, flip, shift, autoUpdate, Placement } from '@floating-ui/dom';

export interface DropdownProps {
  /** Controlled visibility — `true` shows, `false` hides */
  open: boolean;
  /** Reference element that anchors the menu (button, icon, …) */
  trigger?: HTMLElement;
  /** Menu items / JSX content */
  children: ComponentChildren;
  /** Preferred placement (Floating‑UI keywords). Default `"bottom-start"` */
  placement?: string;
  /** Horizontal offset (skidding) */
  offsetSkidding?: number;
  /** Vertical offset (distance) */
  offsetDistance?: number;
  /** Optional fade‑out delay when hiding (ms) */
  delay?: number;
  /** Callbacks */
  onShow?: () => void;
  onHide?: () => void; // should set `open=false` in parent
  className?: string;
}

function resolvePlacement(p: string | undefined): Placement {
  const map: Record<string, Placement> = {
    top: 'top-start',
    bottom: 'bottom-start',
    left: 'left-start',
    right: 'right-start',
  };
  return (p && map[p]) || (p as Placement) || 'bottom-start';
}

export function Dropdown({
  open,
  trigger,
  children,
  placement = 'bottom-start',
  offsetSkidding = -2,
  offsetDistance = 5,
  delay = 0,
  onShow,
  onHide,
  className,
}: DropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const resolvedPlacement = resolvePlacement(placement);

  /* ───────── Position & lifecycle ─────────────────────────────────── */
  useEffect(() => {
    const reference = trigger;
    const floating = menuRef.current;
    if (!floating) return;

    if (open) {
      floating.style.display = 'block';
      onShow?.();
    } else {
      if (delay) {
        setTimeout(() => (floating.style.display = 'none'), delay);
      } else {
        floating.style.display = 'none';
      }
      onHide?.();
    }

    if (!reference) return;
    if (!open) return;

    const cleanup = autoUpdate(reference, floating, () => {
      computePosition(reference, floating, {
        placement: resolvedPlacement,
        strategy: 'absolute',
        middleware: [
          offset({ mainAxis: offsetDistance, crossAxis: offsetSkidding }),
          flip(),
          shift({ padding: 8 }),
        ],
      }).then(({ x, y }) => {
        setPosition({ x, y });
      });
    });

    return () => cleanup();
  }, [open, trigger, placement, offsetSkidding, offsetDistance, delay]);

  /* ───── Global click‑outside detector ─────────────────────────────── */
  useEffect(() => {
    if (!open) return; // only while menu is visible
    const floating = menuRef.current;
    if (!floating) return;

    const handlePointer = (ev: PointerEvent) => {
      const path = ev.composedPath?.() ?? [ev.target as Node];

      // click inside trigger OR inside menu → ignore
      if ((trigger && path.includes(trigger)) || path.includes(floating)) {
        return;
      }

      onHide?.(); // tell parent to close
    };

    window.addEventListener('pointerdown', handlePointer, true); // capture phase
    return () => window.removeEventListener('pointerdown', handlePointer, true);
  }, [open, trigger, onHide]);

  /* ───────── Render ───────────────────────────────────────────────── */
  return (
    <div
      ref={menuRef}
      style={{
        ...(trigger && {
          display: 'none',
          left: `${position.x}px`,
          top: `${position.y}px`,
        }),
      }}
      className={`divide-border-subtle border-border-default bg-bg-elevated absolute z-50 min-w-[8rem] divide-y rounded-lg border shadow-sm transition-opacity duration-150 focus:outline-none ${open ? 'opacity-100' : 'opacity-0'} ${!trigger && 'bottom-0 left-0 right-0'} ${className} `}
    >
      <div className="flex flex-col py-2">{children}</div>
    </div>
  );
}
