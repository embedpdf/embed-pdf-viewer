// Tooltip.tsx  (patched), Fragment
import { h, ComponentChildren, Fragment, Component } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  computePosition,
  offset,
  flip,
  shift,
  arrow as arrowMw,
  autoUpdate,
  Placement,
} from '@floating-ui/dom';

interface TooltipProps {
  children: ComponentChildren;
  content: ComponentChildren;
  position?: Placement;
  className?: string;
  delay?: number;
  style?: 'light' | 'dark';
  trigger?: 'hover' | 'click' | 'none';
}

type PreactComponent = { base: HTMLElement } & Component;

class RefWrapper extends Component<{ children: ComponentChildren; ref: any }> {
  render() {
    return this.props.children;
  }
}

export function Tooltip({
  children,
  content,
  position = 'top',
  className = '',
  delay = 200,
  style = 'dark',
  trigger = 'hover',
}: TooltipProps) {
  const reference = useRef<PreactComponent>(null);
  const floating = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const st = useRef<NodeJS.Timeout | null>(null);

  /* ── position ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!reference.current?.base || !floating.current) return;

    return autoUpdate(reference.current.base, floating.current, () => {
      computePosition(reference.current!.base, floating.current!, {
        placement: position,
        middleware: [
          offset(8),
          flip(),
          shift({ padding: 8 }),
          arrowMw({ element: arrow.current!, padding: 6 }),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        Object.assign(floating.current!.style, { left: `${x}px`, top: `${y}px` });

        const { x: ax, y: ay } = middlewareData.arrow ?? {};
        const side = placement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
        const staticSide = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side];

        /* --- **critical change**: clear the axis we don't use --- */
        Object.assign(arrow.current!.style, {
          left: ax != null ? `${ax}px` : '',
          top: ay != null ? `${ay}px` : '',
          right: '',
          bottom: '',
          [staticSide!]: '-4px',
        });
      });
    });
  }, [position, visible]);

  /* ── trigger wiring ───────────────────────────────────────────────── */
  useEffect(() => {
    const refEl = reference.current?.base;
    const floatEl = floating.current;
    if (!refEl || !floatEl) return;

    /* helpers */
    const clear = () => {
      if (st.current) clearTimeout(st.current);
    };
    const show = () => {
      clear();
      st.current = setTimeout(() => setVisible(true), delay);
    };
    const hide = () => {
      clear();
      setVisible(false);
    };
    const toggle = () => setVisible((v) => !v);

    /* attach based on *current* trigger prop */
    if (trigger === 'hover') {
      refEl.addEventListener('mouseenter', show);
      refEl.addEventListener('mouseleave', hide);
      floatEl.addEventListener('mouseenter', show);
      floatEl.addEventListener('mouseleave', hide);
      refEl.addEventListener('pointerdown', hide);
    } else if (trigger === 'click') {
      refEl.addEventListener('click', toggle);
    }
    /* "none" ⇒ nothing attached */

    if (trigger === 'none') {
      /* cancel any pending timers */
      if (st.current) clearTimeout(st.current);
      /* instantly hide bubble */
      setVisible(false);
    }

    /* detach when `trigger` changes or component unmounts */
    return () => {
      clear();
      if (trigger === 'hover') {
        refEl.removeEventListener('mouseenter', show);
        refEl.removeEventListener('mouseleave', hide);
        floatEl.removeEventListener('mouseenter', show);
        floatEl.removeEventListener('mouseleave', hide);
        refEl.removeEventListener('pointerdown', hide);
      } else if (trigger === 'click') {
        refEl.removeEventListener('click', toggle);
      }
    };
  }, [trigger, delay]);

  /* ── render ───────────────────────────────────────────────────────── */
  return (
    <Fragment>
      <div
        ref={floating}
        role="tooltip"
        className={`z-100 pointer-events-none absolute select-none whitespace-nowrap rounded-lg px-3 py-2 text-sm shadow-md transition-opacity duration-150 ${
          style === 'dark'
            ? 'bg-tooltip-bg text-tooltip-fg'
            : 'border-border-subtle bg-bg-elevated text-fg-primary border'
        } ${visible ? 'opacity-100' : 'opacity-0'} ${className} `}
        style={{ visibility: visible ? 'visible' : 'hidden' }}
      >
        {content}
        {/* the arrow inherits background so it never mismatches */}
        <div
          ref={arrow}
          className={`absolute h-2 w-2 rotate-45 bg-inherit ${style === 'light' ? 'border-border-subtle border' : ''} `}
        />
      </div>
      <RefWrapper ref={reference}>{children}</RefWrapper>
    </Fragment>
  );
}
