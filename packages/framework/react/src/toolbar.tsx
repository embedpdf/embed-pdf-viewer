/**
 * The headless <Toolbar>: it measures what fits and makes room, and you draw
 * every part.
 *
 *   1. a hidden measurement layer renders every unit in every variant (plus
 *      folded groups and the "More" button), each watched by
 *      `@embedpdf/web`'s `observeWidth`, so a new language, a font loading,
 *      browser zoom and your CSS all re-measure on their own; the widths
 *      become fit metrics (`createToolbarWidths`);
 *   2. core-ui's `solve()` gives each unit a variant, a folded group or the
 *      "More" menu, and `layoutToolbar` turns that fit into the parts to
 *      draw: pure and tested on their own;
 *   3. the live row renders that; the "More" menu is derived (`projectOverflow`)
 *      from what didn't fit, never written by hand.
 *
 * Every part is a render prop with a plain default: the app owns the pixels,
 * this component owns the fitting. The defaults' colors come from the
 * `--epdf-toolbar-*` CSS variables only.
 */

// The toolbar's vocabulary: the schema a bar is written in, and the helpers that change one.
export {
  DEFAULT_IMPORTANCE,
  PINNED,
  addItem,
  chromeHelpers,
  custom,
  defineChrome,
  group,
  item,
  removeItems,
  replaceItem,
  validateChrome,
} from '@embedpdf/core-ui';
export type {
  AddItemSpec,
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  ChromeHelpers,
  ChromeSchema,
  CustomItem,
  FrameSchema,
  Importance,
  MenuSchema,
  MenuSection,
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
  createToolbarWidths,
  observeContentWidth,
  observeOutsidePress,
  observeWidth,
  paintDefault,
  toolbarMeasureKey,
} from '@embedpdf/web';
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
 * un-measured sibling, for contextual strips (ChromeSchema.strips). The schema
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
  /** Px between adjacent items (CSS flex gap; the solver budgets the same number). */
  gap?: number;
  /** Width of the separator element your renderSeparator draws. Default 1. */
  separatorWidth?: number;
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
   * capture it in a ref to use it in an effect.
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
  /** Derived separator between adjacent visible groups. Default: a 1px line. */
  renderSeparator?: () => React.ReactNode;
  /** The "More" button. Default: a plain ⋯ button. */
  renderOverflowTrigger?: (isOpen: boolean, toggle: () => void) => React.ReactNode;
  /** The derived overflow menu. Default: a minimal popover. */
  renderOverflowMenu?: (view: OverflowMenuView) => React.ReactNode;
}

// ── measurement ───────────────────────────────────────────────────────────────

/** Report this node's border-box width under `k`, live. */
function Measured({
  k,
  onWidth,
  children,
}: {
  k: string;
  onWidth: (key: string, width: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () => (ref.current ? observeWidth(ref.current, (width) => onWidth(k, width)) : undefined),
    [k, onWidth],
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
 * so its width can only be observed where it actually renders.
 */
function NativeSlotSocket({
  name,
  k,
  onWidth,
  children,
}: {
  name: string;
  k: string;
  onWidth: (key: string, width: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSlotElement>(null);
  // Projection changes (a child slotted in/out) resize the socket's
  // inline-flex box, so one observer covers both content and assignment.
  useLayoutEffect(
    () => (ref.current ? observeWidth(ref.current, (width) => onWidth(k, width)) : undefined),
    [k, onWidth],
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

const measureLayerStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  height: 0,
  overflow: 'hidden',
  visibility: 'hidden',
  pointerEvents: 'none',
  display: 'flex',
  whiteSpace: 'nowrap',
};

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

const defaultRenderSeparator = (): React.ReactNode => (
  <span style={{ width: 1, alignSelf: 'stretch', background: 'currentColor', opacity: 0.2 }} />
);

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

function DefaultOverflowMenu({ view }: { view: OverflowMenuView }) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(view.close);
  close.current = view.close;
  useEffect(() => {
    // The menu's parent holds its button too: a press on it is the button's own toggle.
    const container = menu.current?.parentElement ?? menu.current;
    return view.isOpen && container
      ? observeOutsidePress(container, () => close.current())
      : undefined;
  }, [view.isOpen]);
  if (!view.isOpen) return null;
  return (
    <div
      ref={menu}
      role="menu"
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
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

function DefaultCollapsed({ view }: { view: CollapsedGroupView }) {
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
  return <CollapsedMenuButton view={view} />;
}

function CollapsedMenuButton({ view }: { view: CollapsedGroupView }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {defaultRenderOverflowTrigger(isOpen, () => setOpen((previous) => !previous))}
      <DefaultOverflowMenu view={groupMenuView(view, isOpen, () => setOpen(false))} />
    </span>
  );
}

/** Default shed-group disclosure: a chevron opening a radio menu of the
 *  hidden children. */
function DefaultGroupTrigger({ view }: { view: GroupDisclosureView }) {
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
      <DefaultOverflowMenu view={groupMenuView(view, isOpen, () => setOpen(false))} />
    </span>
  );
}

// ── the toolbar ───────────────────────────────────────────────────────────────

export function Toolbar({
  bar,
  gap = 8,
  separatorWidth = 1,
  className,
  style,
  renderCommand = defaultRenderCommand,
  renderCustom,
  renderCollapsed,
  renderGroupTrigger,
  renderSeparator = defaultRenderSeparator,
  renderOverflowTrigger = defaultRenderOverflowTrigger,
  renderOverflowMenu,
}: ToolbarProps) {
  const kernel = useKernel();
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();

  // Command state is derived-on-read; re-render on the kernel's change stream
  // so labels/active/visible (and thus the hidden layer's measurements) stay
  // live. The toolbar is small — a per-action render is the simple, correct
  // baseline.
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => kernel.subscribe(force), [kernel]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(
    () =>
      containerRef.current
        ? observeContentWidth(containerRef.current, setContainerWidth)
        : undefined,
    [],
  );

  // A width that changed renders (and solves) again.
  const [widths] = useState(createToolbarWidths);
  const [, bumpMeasureVersion] = useReducer((x: number) => x + 1, 0);
  const onWidth = useMemo(
    () => (key: string, width: number) => {
      if (widths.report(key, width)) bumpMeasureVersion();
    },
    [widths],
  );

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
    metrics: widths.metrics(gap, separatorWidth),
    measureKey: toolbarMeasureKey,
    containerWidth,
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
            measure: (width) => onWidth(part.measureKey, width),
          });
          return custom === undefined ? terminal() : custom;
        }
        if (layer === 'measure') return null;
        return (
          <NativeSlotSocket name={part.name} k={part.measureKey} onWidth={onWidth}>
            {terminal()}
          </NativeSlotSocket>
        );
      }
      case 'collapsed': {
        const drawn = renderCollapsed?.(part.view);
        return drawn === undefined ? <DefaultCollapsed view={part.view} /> : drawn;
      }
      case 'disclosure': {
        const drawn = renderGroupTrigger?.(part.view);
        return drawn === undefined ? <DefaultGroupTrigger view={part.view} /> : drawn;
      }
    }
  };

  const renderLiveSection = (section: LiveSection<ResolvedCommand>): React.ReactNode =>
    section.groups.map((group, i) => (
      <React.Fragment key={group.id}>
        {i > 0 && renderSeparator()}
        {group.parts.map((part) => (
          <React.Fragment key={part.key}>{renderPart(part, 'live')}</React.Fragment>
        ))}
      </React.Fragment>
    ));

  /**
   * Segment layout. The center segment carries auto margins: it balances in
   * the leftover space (true center when the flanks are symmetric) and yields
   * when they aren't, collapsing to zero
   * before anything can overlap. The container itself has no gap — segments
   * space themselves — so the solver's global budget (sum of unit widths +
   * per-unit gaps) is exactly the layout's minimum width: what the solver
   * says fits, fits. Its cross-segment gap allowance (≤ 2×gap) becomes slack
   * the auto margins absorb, keeping ≥ gap between segments at the floor.
   * Segments never grow or shrink: fit is the solver's job, not flexbox's.
   */
  const sectionStyle = (position: 'start' | 'center' | 'end'): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap,
    flex: '0 0 auto',
    ...(position === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
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
      className={className}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}
    >
      {layout.sections.map((section) => (
        <div key={section.name} style={sectionStyle(section.name)}>
          {renderLiveSection(section)}
          {section.name === 'end' && layout.hasOverflow && (
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {renderOverflowTrigger(overflowOpen, () => setOverflowOpen((previous) => !previous))}
              {renderOverflowMenu ? (
                renderOverflowMenu(overflowView)
              ) : (
                <DefaultOverflowMenu view={overflowView} />
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
      <div aria-hidden style={measureLayerStyle}>
        {layout.measured
          .filter((part) => !isExternalSlot(part))
          .map((part) => (
            <Measured key={part.measureKey} k={part.measureKey} onWidth={onWidth}>
              {renderPart(part, 'measure')}
            </Measured>
          ))}
        <Measured k={toolbarMeasureKey.overflowTrigger} onWidth={onWidth}>
          {renderOverflowTrigger(false, () => {})}
        </Measured>
      </div>
    </div>
  );
}
