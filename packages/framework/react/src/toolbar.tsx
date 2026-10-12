/**
 * The headless <Toolbar>: it measures what fits and makes room, and you draw
 * every part.
 *
 *   1. a hidden measurement layer renders every unit in every variant (plus
 *      folded groups and the "More" button), each watched by
 *      `@embedpdf/web`'s `observeLength` along the toolbar (widths, or
 *      heights when it is vertical), so a new language, a font loading,
 *      browser zoom and your CSS all re-measure on their own; the lengths
 *      become fit metrics (`createToolbarLengths`);
 *   2. core-ui's `solve()` gives each unit a variant, a folded group or the
 *      "More" menu, and `layoutToolbar` turns that fit into the parts to
 *      draw: pure and tested on their own;
 *   3. the live row renders that; the "More" menu is derived (`projectOverflow`)
 *      from what didn't fit, never written by hand.
 *
 * The toolbar is one tab stop with arrow keys along it (`attachToolbarFocus`),
 * and its default menus take the menu keys (`attachMenuKeys`). Every part is a
 * render prop with a plain default: the app owns the pixels, this component
 * owns the fitting and the keyboard. The defaults' colors come from the
 * `--epdf-toolbar-*` CSS variables only.
 */

// The toolbar's vocabulary: the schema a bar is written in.
export { DEFAULT_IMPORTANCE, PINNED, custom, group, item } from '@embedpdf/core-ui';
export type {
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  CustomItem,
  Importance,
  OverflowRow,
  OverflowSection,
  Variant,
} from '@embedpdf/core-ui';
import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  groupMenuView,
  layoutToolbar,
  normalizeBar,
  sameStripGroups,
  stripGroupsOf,
} from '@embedpdf/core-ui';
import type {
  BarSchema,
  CollapsedGroupView as CollapsedGroupViewOf,
  CustomSlotCtx,
  GroupDisclosureView as GroupDisclosureViewOf,
  LiveSection,
  OverflowMenuView as OverflowMenuViewOf,
  StripView as StripViewOf,
  StripViewGroup as StripViewGroupOf,
  ToolbarPart,
} from '@embedpdf/core-ui';
import { resolvedCommandsEqual, unregisteredCommand } from '@embedpdf/plugin-commands/contract';
// The "More" menu asks which menu a command opens, a host fact, so the host lens is bound here.
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import {
  TOOLBAR_ITEM_ATTRIBUTE,
  attachMenuKeys,
  attachToolbarFocus,
  createToolbarLengths,
  focusablesIn,
  observeContentLength,
  observeLength,
  observeOutsidePress,
  paintDefault,
  toolbarMeasureKey,
} from '@embedpdf/web';
import type { Orientation, RovingFocus } from '@embedpdf/web';
import { INERT } from './inert';
import { useCapability, useDocumentId, useKernel, useKernelValue } from './runtime';

// ── public render-prop contracts ─────────────────────────────────────────────

/** A group folded into one control: its commands, resolved live, and how to run one. */
export type CollapsedGroupView = CollapsedGroupViewOf<ResolvedCommand>;

/** The "More" menu: what didn't fit, in sections, and the calls a menu needs. */
export type OverflowMenuView = OverflowMenuViewOf<ResolvedCommand>;

/**
 * A shed group's disclosure — the derived trigger rendered inside the group.
 * `commands` is what sits behind the trigger: the shed children in bar order,
 * resolved live. In the measurement layer the trigger is measured with the
 * full group as content, so a count-dependent trigger (e.g. a "+3" badge) is
 * budgeted at its widest form.
 */
export type GroupDisclosureView = GroupDisclosureViewOf<ResolvedCommand>;

/** Passed to custom-slot renderers alongside the variant. */
export type { CustomSlotCtx };

// ── the strip view — a bar projected through the registry, live ──────────────

/** A group of a strip: its visible commands, bar order. Groups are separator boundaries. */
export type StripViewGroup = StripViewGroupOf<ResolvedCommand>;

/** A contextual strip, resolved: only visible commands, only non-empty groups. */
export type StripView = StripViewOf<ResolvedCommand>;

const stripGroupsEqual = (
  left: readonly StripViewGroup[],
  right: readonly StripViewGroup[],
): boolean => sameStripGroups(left, right, resolvedCommandsEqual);

const NO_STRIP_GROUPS: readonly StripViewGroup[] = [];

/**
 * The live projection of a bar through the command registry — <Toolbar>'s
 * un-measured sibling, for contextual strips (a bar over a selection). The schema
 * declares what could appear; each command's `visible` derivation decides what
 * does; null means nothing currently applies, so `if (!view) return null` is
 * the caller's entire show/hide logic. `execute` is pre-bound to this
 * subtree's document. Reads are value-equal (resolvedCommandsEqual), so
 * consumers re-render on real change, not on every store action.
 */
export function useStripView(bar: BarSchema | undefined): StripView | null {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const normalized = useMemo(() => (bar ? normalizeBar(bar) : null), [bar]);
  const groups = useKernelValue(
    () =>
      normalized
        ? stripGroupsOf(normalized, (id) => commands.resolveCommand(id, documentId ?? undefined))
        : NO_STRIP_GROUPS,
    stripGroupsEqual,
  );
  return useMemo(
    () =>
      groups.length === 0
        ? null
        : {
            groups,
            execute: (id: string) =>
              void commands.execute(id, { documentId: documentId ?? undefined }),
          },
    [groups, commands, documentId],
  );
}

export interface ToolbarProps {
  bar: BarSchema;
  /**
   * Which way the toolbar runs. A vertical toolbar fits the height it's given,
   * so give it one; it stacks its sections top, middle and bottom, and draws
   * every command at `'icon'`, with the label for a tooltip. Default
   * `'horizontal'`.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Px between adjacent items (CSS flex gap; the solver budgets the same number). */
  gap?: number;
  /**
   * The thickness of the separator your renderSeparator draws: its width
   * across a horizontal toolbar, its height in a vertical one. Default 1.
   */
  separatorWidth?: number;
  /** The toolbar's name for screen readers, for a page with more than one toolbar. */
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
  /** A command button at a given variant. Default: a plain <button> with the command's label. */
  renderCommand?: (cmd: ResolvedCommand, variant: string, run: () => void) => React.ReactNode;
  /**
   * Your own items, one renderer per name (from `custom(name, command)`),
   * called with the variant the fit chose. A renderer that returns
   * `undefined` draws the item's command instead (`renderCommand` with the
   * terminal command, variant `'icon'`). An item with no entry here renders
   * as a native `<slot name={slot}>` socket with that command as fallback
   * content: in light DOM that displays the fallback; inside a shadow root
   * the host's light-DOM children project into it — the children-as-slots
   * contract. Sockets are measured live (they can't be duplicated into the
   * measurement layer: only the first same-named slot in tree order gets the
   * projected nodes). `ctx.measure` is a new function on every render;
   * capture it in a ref to use it in an effect. The first element of an item
   * that takes focus is the item's stop in the toolbar's arrow-key order.
   */
  renderCustom?: Record<string, (variant: string, ctx: CustomSlotCtx) => React.ReactNode>;
  /**
   * A group in its collapsed form. Default: <select> for 'select', menu button for 'menu'; a
   * renderer that returns `undefined` leaves the group to the default.
   */
  renderCollapsed?: (view: CollapsedGroupView) => React.ReactNode;
  /** A shed group's disclosure trigger (+ its popover — the renderer owns the
   *  open state). Default: a chevron button opening a radio menu; `undefined`
   *  leaves it to the default too. */
  renderGroupTrigger?: (view: GroupDisclosureView) => React.ReactNode;
  /** Derived separator between adjacent visible groups. Default: a 1px line across the toolbar. */
  renderSeparator?: () => React.ReactNode;
  /** The "More" button. Default: a plain ⋯ button. */
  renderOverflowTrigger?: (isOpen: boolean, toggle: () => void) => React.ReactNode;
  /** The derived overflow menu. Default: a minimal popover. */
  renderOverflowMenu?: (view: OverflowMenuView) => React.ReactNode;
}

// ── measurement ───────────────────────────────────────────────────────────────

/** Report this node's border-box length along the toolbar under `k`, live. */
function Measured({
  k,
  orientation,
  onLength,
  children,
}: {
  k: string;
  orientation: Orientation;
  onLength: (key: string, length: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      ref.current
        ? observeLength(ref.current, orientation, (length) => onLength(k, length))
        : undefined,
    [k, orientation, onLength],
  );
  return (
    <span ref={ref} style={{ display: 'inline-flex', flexShrink: 0 }}>
      {children}
    </span>
  );
}

/**
 * The socket for an unregistered custom unit: a real `<slot>` element. Inside
 * the <embedpdf-viewer> shadow root the browser projects same-named light-DOM
 * children into it; anywhere else it just displays its fallback (the terminal
 * command). Measured live — the projected content lives in the host's world,
 * so its length can only be observed where it actually renders.
 */
function NativeSlotSocket({
  name,
  k,
  orientation,
  onLength,
  children,
}: {
  name: string;
  k: string;
  orientation: Orientation;
  onLength: (key: string, length: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSlotElement>(null);
  // Projection changes (a child slotted in/out) resize the socket's
  // inline-flex box, so one observer covers both content and assignment.
  useLayoutEffect(
    () =>
      ref.current
        ? observeLength(ref.current, orientation, (length) => onLength(k, length))
        : undefined,
    [k, orientation, onLength],
  );
  return (
    <slot
      ref={ref}
      name={name}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
    >
      {children}
    </slot>
  );
}

/**
 * The hidden measurement layer: a row for a horizontal toolbar, a column for a
 * vertical one, and no height either way, so it never adds to the page. A
 * column keeps each item at its own width, so no text wraps and changes the
 * heights it reports.
 */
const measureLayerStyle = (orientation: Orientation): React.CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  height: 0,
  overflow: 'hidden',
  visibility: 'hidden',
  pointerEvents: 'none',
  display: 'flex',
  whiteSpace: 'nowrap',
  ...(orientation === 'vertical' ? { flexDirection: 'column', alignItems: 'flex-start' } : null),
});

/** Marks the element around each item of the live row: its first focusable element is a stop. */
const TOOLBAR_ITEM = { [TOOLBAR_ITEM_ATTRIBUTE]: '' } as Record<string, string>;

/** The element around an item adds no box, so the item lays out as the section's own child. */
const ITEM_STYLE: React.CSSProperties = { display: 'contents' };

// ── defaults: plain, and meant to be replaced ────────────────────────────────

const SURFACE = paintDefault('toolbar-surface');
const BORDER = paintDefault('toolbar-border');
const ACTIVE = paintDefault('toolbar-active');

const defaultRenderCommand = (
  cmd: ResolvedCommand,
  _variant: string,
  run: () => void,
): React.ReactNode => (
  <button
    type="button"
    onClick={run}
    disabled={!cmd.enabled}
    aria-pressed={cmd.active || undefined}
    aria-haspopup={cmd.menu ? 'menu' : undefined}
    title={cmd.label}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      whiteSpace: 'nowrap',
      color: 'inherit',
      font: 'inherit',
      background: cmd.active ? ACTIVE : 'transparent',
      border: `1px solid ${BORDER}`,
      borderRadius: 4,
      cursor: cmd.enabled ? 'pointer' : 'default',
      opacity: cmd.enabled ? 1 : 0.4,
    }}
  >
    {/* Icons are the app's: the plain button shows the label in every variant. */}
    {cmd.label}
  </button>
);

/** A 1px line across the toolbar: upright in a horizontal one, flat in a vertical one. */
function DefaultSeparator({ orientation }: { orientation: Orientation }) {
  const thickness = orientation === 'vertical' ? { height: 1 } : { width: 1 };
  return (
    <span
      style={{ ...thickness, alignSelf: 'stretch', background: 'currentColor', opacity: 0.2 }}
    />
  );
}

const defaultRenderOverflowTrigger = (isOpen: boolean, toggle: () => void): React.ReactNode => (
  <button
    type="button"
    onClick={toggle}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    title="More"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      color: 'inherit',
      font: 'inherit',
      border: `1px solid ${BORDER}`,
      borderRadius: 4,
      background: isOpen ? ACTIVE : 'transparent',
      cursor: 'pointer',
    }}
  >
    ⋯
  </button>
);

/** Where a default menu opens: under a horizontal toolbar's button, beside a vertical one's. */
const menuPlacement = (orientation: Orientation): React.CSSProperties =>
  orientation === 'vertical'
    ? { top: 0, insetInlineStart: '100%' }
    : { top: '100%', insetInlineEnd: 0 };

/**
 * The default menu, opened by the button beside it in the same parent: it
 * closes on a press outside that parent, and takes the menu keys while open.
 */
function DefaultOverflowMenu({
  view,
  orientation,
}: {
  view: OverflowMenuView;
  orientation: Orientation;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(view.close);
  close.current = view.close;
  useLayoutEffect(() => {
    const element = menu.current;
    if (!view.isOpen || !element) return;
    // The menu's parent holds its button too: a press on it is the button's own toggle.
    const container = element.parentElement ?? element;
    const trigger =
      focusablesIn(container).find((candidate) => !element.contains(candidate)) ?? null;
    const stopOutside = observeOutsidePress(container, () => close.current());
    const detachKeys = attachMenuKeys(element, { trigger, close: () => close.current() });
    return () => {
      stopOutside();
      detachKeys();
    };
  }, [view.isOpen]);
  if (!view.isOpen) return null;
  return (
    <div
      ref={menu}
      role="menu"
      style={{
        position: 'absolute',
        ...menuPlacement(orientation),
        zIndex: 41,
        minWidth: 200,
        padding: 4,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}
    >
      {view.sections.map((section, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />}
          {section.rows.map((row) => {
            const cmd = view.resolve(row.command);
            if (!cmd) return null;
            const isSubmenu = row.type === 'submenu';
            return (
              <button
                key={row.command}
                type="button"
                role={section.role === 'radio' ? 'menuitemradio' : 'menuitem'}
                aria-checked={section.role === 'radio' ? cmd.active : undefined}
                disabled={!cmd.enabled}
                tabIndex={-1}
                onClick={() => {
                  view.execute(row.command);
                  if (!isSubmenu) view.close();
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '6px 8px',
                  border: 'none',
                  color: 'inherit',
                  font: 'inherit',
                  background: 'transparent',
                  cursor: cmd.enabled ? 'pointer' : 'default',
                  opacity: cmd.enabled ? 1 : 0.4,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>
                  {cmd.active && section.role === 'radio' ? '• ' : ''}
                  {cmd.label}
                </span>
                {isSubmenu ? <span>▸</span> : null}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

function DefaultCollapsed({
  view,
  orientation,
}: {
  view: CollapsedGroupView;
  orientation: Orientation;
}) {
  if (view.collapse === 'select') {
    const active = view.commands.find((command) => command.active);
    return (
      <select
        value={active?.id ?? ''}
        onChange={(event) => view.execute(event.target.value)}
        style={{
          padding: '4px 6px',
          font: 'inherit',
          borderRadius: 4,
          border: `1px solid ${BORDER}`,
          background: SURFACE,
        }}
      >
        {view.commands.map((command) => (
          <option key={command.id} value={command.id} disabled={!command.enabled}>
            {command.label}
          </option>
        ))}
      </select>
    );
  }
  // 'menu': reuse the overflow popover, scoped to this group's commands.
  return <CollapsedMenuButton view={view} orientation={orientation} />;
}

function CollapsedMenuButton({
  view,
  orientation,
}: {
  view: CollapsedGroupView;
  orientation: Orientation;
}) {
  const [isOpen, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {defaultRenderOverflowTrigger(isOpen, () => setOpen((previous) => !previous))}
      <DefaultOverflowMenu
        view={groupMenuView(view, isOpen, () => setOpen(false))}
        orientation={orientation}
      />
    </span>
  );
}

/** Default shed-group disclosure: a chevron opening a radio menu of the
 *  hidden children. */
function DefaultGroupTrigger({
  view,
  orientation,
}: {
  view: GroupDisclosureView;
  orientation: Orientation;
}) {
  const [isOpen, setOpen] = useState(false);
  const someActive = view.commands.some((command) => command.active);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="More"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 6px',
          color: 'inherit',
          font: 'inherit',
          border: `1px solid ${BORDER}`,
          borderRadius: 4,
          // A hint that the active item is in here.
          background: isOpen || someActive ? ACTIVE : 'transparent',
          cursor: 'pointer',
        }}
      >
        ▾
      </button>
      <DefaultOverflowMenu
        view={groupMenuView(view, isOpen, () => setOpen(false))}
        orientation={orientation}
      />
    </span>
  );
}

// ── the toolbar ───────────────────────────────────────────────────────────────

export function Toolbar({
  bar,
  orientation = 'horizontal',
  gap = 8,
  separatorWidth = 1,
  'aria-label': ariaLabel,
  className,
  style,
  renderCommand = defaultRenderCommand,
  renderCustom,
  renderCollapsed,
  renderGroupTrigger,
  renderSeparator,
  renderOverflowTrigger = defaultRenderOverflowTrigger,
  renderOverflowMenu,
}: ToolbarProps) {
  const kernel = useKernel();
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const vertical = orientation === 'vertical';

  // Command state is derived-on-read; re-render on the kernel's change stream
  // so labels/active/visible (and thus the hidden layer's measurements) stay
  // live. The toolbar is small — a per-action render is the simple, correct
  // baseline.
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => kernel.subscribe(force), [kernel]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerLength, setContainerLength] = useState(0);
  useLayoutEffect(
    () =>
      containerRef.current
        ? observeContentLength(containerRef.current, orientation, setContainerLength)
        : undefined,
    [orientation],
  );

  // A length that changed renders (and solves) again.
  const [lengths] = useState(createToolbarLengths);
  const [, bumpMeasureVersion] = useReducer((version: number) => version + 1, 0);
  const onLength = useMemo(
    () => (key: string, length: number) => {
      if (lengths.report(orientation, key, length)) bumpMeasureVersion();
    },
    [lengths, orientation],
  );

  // The keyboard: one tab stop, and arrow keys along the toolbar.
  const roving = useRef<RovingFocus | null>(null);
  useLayoutEffect(() => {
    const toolbar = containerRef.current;
    if (!toolbar) return;
    const focus = attachToolbarFocus(toolbar, orientation);
    roving.current = focus;
    return () => {
      focus.detach();
      roving.current = null;
    };
  }, [orientation]);
  // Any render can add, remove or disable an item, so the tab stop is checked after each one.
  useLayoutEffect(() => roving.current?.refresh());

  const resolveCmd = (id: string): ResolvedCommand | null =>
    commands.resolveCommand(id, documentId ?? undefined);
  const executeCmd = (id: string) =>
    void commands.execute(id, { documentId: documentId ?? undefined });

  // Structure → visible structure → fit → parts (core-ui's `layoutToolbar`).
  // Cheap enough to run per render: O(items), and items is ~dozens.
  const normalized = useMemo(() => normalizeBar(bar), [bar]);
  const layout = layoutToolbar({
    bar: normalized,
    resolve: resolveCmd,
    unregistered: unregisteredCommand,
    execute: executeCmd,
    menuTarget: (id) => commands.getMenuTarget(id),
    metrics: lengths.metrics(orientation, gap, separatorWidth),
    measureKey: toolbarMeasureKey,
    containerLength,
    orientation,
  });

  const [overflowOpen, setOverflowOpen] = useState(false);
  useEffect(() => {
    if (!layout.hasOverflow) setOverflowOpen(false);
  }, [layout.hasOverflow]);

  /** External = custom part with no registered renderer → native socket,
   *  live-measured (it must not appear in the measurement layer: only the
   *  first same-named <slot> in tree order receives the projected nodes). */
  const isExternalSlot = (part: ToolbarPart<ResolvedCommand>): boolean =>
    part.kind === 'custom' && !renderCustom?.[part.name];

  // ── part rendering (shared by live row and measure layer) ──────────────────
  // A render prop that returns `undefined` leaves the part to its default.
  const renderPart = (
    part: ToolbarPart<ResolvedCommand>,
    layer: 'live' | 'measure',
  ): React.ReactNode => {
    switch (part.kind) {
      case 'command':
        return renderCommand(part.command, part.variant, part.run);
      case 'custom': {
        // The item's command, as a button: what it draws when nothing else does.
        const terminal = () =>
          part.terminal ? renderCommand(part.terminal, 'icon', part.runTerminal) : null;
        const registered = renderCustom?.[part.name];
        if (registered) {
          const custom = registered(part.variant, {
            layer,
            measure: (length) => onLength(part.measureKey, length),
          });
          return custom === undefined ? terminal() : custom;
        }
        if (layer === 'measure') return null;
        return (
          <NativeSlotSocket
            name={part.name}
            k={part.measureKey}
            orientation={orientation}
            onLength={onLength}
          >
            {terminal()}
          </NativeSlotSocket>
        );
      }
      case 'collapsed': {
        const drawn = renderCollapsed?.(part.view);
        return drawn === undefined ? (
          <DefaultCollapsed view={part.view} orientation={orientation} />
        ) : (
          drawn
        );
      }
      case 'disclosure': {
        const drawn = renderGroupTrigger?.(part.view);
        return drawn === undefined ? (
          <DefaultGroupTrigger view={part.view} orientation={orientation} />
        ) : (
          drawn
        );
      }
    }
  };

  const renderLiveSection = (section: LiveSection<ResolvedCommand>): React.ReactNode =>
    section.groups.map((group, i) => (
      <React.Fragment key={group.id}>
        {i > 0 &&
          (renderSeparator ? renderSeparator() : <DefaultSeparator orientation={orientation} />)}
        {group.parts.map((part) => (
          <span key={part.key} {...TOOLBAR_ITEM} style={ITEM_STYLE}>
            {renderPart(part, 'live')}
          </span>
        ))}
      </React.Fragment>
    ));

  /**
   * Segment layout, along the toolbar's axis. The center segment carries auto
   * margins: it balances in the leftover space (true center when the flanks
   * are symmetric) and yields when they aren't, collapsing to zero before
   * anything can overlap. The container itself has no gap — segments space
   * themselves — so the solver's global budget (sum of unit lengths +
   * per-unit gaps) is exactly the layout's minimum length: what the solver
   * says fits, fits. Its cross-segment gap allowance (≤ 2×gap) becomes slack
   * the auto margins absorb, keeping ≥ gap between segments at the floor.
   * Segments never grow or shrink: fit is the solver's job, not flexbox's.
   */
  const sectionStyle = (position: 'start' | 'center' | 'end'): React.CSSProperties => ({
    display: 'flex',
    flexDirection: vertical ? 'column' : 'row',
    alignItems: 'center',
    gap,
    flex: '0 0 auto',
    ...(position !== 'center'
      ? null
      : vertical
        ? { marginTop: 'auto', marginBottom: 'auto' }
        : { marginLeft: 'auto', marginRight: 'auto' }),
  });

  const overflowView: OverflowMenuView = {
    sections: layout.overflow,
    isOpen: overflowOpen,
    close: () => setOverflowOpen(false),
    resolve: resolveCmd,
    execute: executeCmd,
  };

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        ...style,
      }}
    >
      {layout.sections.map((section) => (
        <div key={section.name} style={sectionStyle(section.name)}>
          {renderLiveSection(section)}
          {section.name === 'end' && layout.hasOverflow && (
            <span {...TOOLBAR_ITEM} style={{ position: 'relative', display: 'inline-flex' }}>
              {renderOverflowTrigger(overflowOpen, () => setOverflowOpen((previous) => !previous))}
              {renderOverflowMenu ? (
                renderOverflowMenu(overflowView)
              ) : (
                <DefaultOverflowMenu view={overflowView} orientation={orientation} />
              )}
            </span>
          )}
        </div>
      ))}

      {/* The measurement layer: every unit in every variant, every collapsed
          group form, and the trigger — hidden, inert, observed. Text reflow
          (locale, fonts, zoom) fires the observers; no change-handling code.
          External sockets are excluded: they are live-measured, and a
          duplicate <slot> here would steal the projection from the row. */}
      <div aria-hidden {...INERT} style={measureLayerStyle(orientation)}>
        {layout.measured
          .filter((part) => !isExternalSlot(part))
          .map((part) => (
            <Measured
              key={part.measureKey}
              k={part.measureKey}
              orientation={orientation}
              onLength={onLength}
            >
              {renderPart(part, 'measure')}
            </Measured>
          ))}
        <Measured
          k={toolbarMeasureKey.overflowTrigger}
          orientation={orientation}
          onLength={onLength}
        >
          {renderOverflowTrigger(false, () => {})}
        </Measured>
      </div>
    </div>
  );
}
