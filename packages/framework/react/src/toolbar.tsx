/**
 * The headless <Toolbar> — where measurement meets the pure solver.
 *
 * The schema is structure-only; what fits is OBSERVED, not configured:
 *
 *   1. a hidden measurement layer renders every unit in every variant (plus
 *      collapsed group forms and the overflow trigger), each wrapped in a
 *      ResizeObserver — so locale flips, font loads, browser zoom, and
 *      embedder CSS all re-measure themselves with zero handling code;
 *   2. ui-core's solve() assigns each unit a variant / collapsed / overflow —
 *      pure, deterministic, tested in isolation;
 *   3. the live row renders the assignment; the overflow menu is DERIVED
 *      (projectOverflow) — the complement of the visible set, never authored.
 *
 * Rendering is render-prop driven with functional defaults: the app owns the
 * pixels, this component owns the physics.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/core-ui';
import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { filterBar, normalizeBar, projectOverflow, projectStrip, solve } from '@embedpdf/core-ui';
import type {
  BarSchema,
  FitMetrics,
  NormalizedGroup,
  NormalizedSection,
  NormalizedUnit,
  OverflowSection,
} from '@embedpdf/core-ui';
import { CommandsToken, resolvedCommandsEqual } from '@embedpdf/plugin-commands';
import type { ResolvedCommand } from '@embedpdf/plugin-commands';
import { useCapability, useDocumentId, useKernel, useKernelValue } from './runtime';

// ── public render-prop contracts ─────────────────────────────────────────────

export interface CollapsedGroupView {
  readonly id: string;
  readonly labelKey?: string;
  readonly collapse: 'menu' | 'select';
  readonly role: 'buttons' | 'tabs';
  /** The group's commands (custom items via their terminal), resolved live. */
  readonly commands: readonly ResolvedCommand[];
  execute(id: string): void;
}

export interface OverflowMenuView {
  readonly sections: readonly OverflowSection[];
  readonly isOpen: boolean;
  close(): void;
  resolve(id: string): ResolvedCommand | null;
  execute(id: string): void;
}

/**
 * A shed group's disclosure — the derived trigger rendered INSIDE the group
 * (v2's overflow-tabs-button). `commands` is what sits behind the trigger:
 * the shed children in bar order, resolved live. In the measurement layer the
 * trigger is measured with the FULL group as content, so a count-dependent
 * trigger (e.g. a "+3" badge) is budgeted at its widest form.
 */
export interface GroupDisclosureView {
  readonly id: string;
  readonly labelKey?: string;
  readonly role: 'buttons' | 'tabs';
  readonly commands: readonly ResolvedCommand[];
  execute(id: string): void;
}

// ── the strip view — a bar projected through the registry, live ──────────────

export interface StripViewGroup {
  readonly id: string;
  readonly labelKey?: string;
  /** Visible commands, bar order. Groups are separator boundaries. */
  readonly commands: readonly ResolvedCommand[];
}

/** A contextual strip, resolved: only visible commands, only non-empty groups. */
export interface StripView {
  readonly groups: readonly StripViewGroup[];
  execute(id: string): void;
}

const stripGroupsEqual = (a: readonly StripViewGroup[], b: readonly StripViewGroup[]): boolean =>
  a.length === b.length &&
  a.every(
    (g, i) =>
      g.id === b[i].id &&
      g.commands.length === b[i].commands.length &&
      g.commands.every((c, j) => resolvedCommandsEqual(c, b[i].commands[j])),
  );

const NO_STRIP_GROUPS: readonly StripViewGroup[] = [];

/**
 * The live projection of a bar through the command registry — <Toolbar>'s
 * un-measured sibling, for contextual strips (ChromeSchema.strips). The schema
 * declares what COULD appear; each command's `visible` derivation decides what
 * DOES; null means nothing currently applies, so `if (!view) return null` is
 * the caller's entire show/hide logic. `execute` is pre-bound to this
 * subtree's document. Reads are value-equal (resolvedCommandsEqual), so
 * consumers re-render on real change, not on every store action.
 */
export function useStripView(bar: BarSchema | undefined): StripView | null {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const normalized = useMemo(() => (bar ? normalizeBar(bar) : null), [bar]);
  const groups = useKernelValue(() => {
    if (!normalized) return NO_STRIP_GROUPS;
    const resolved = new Map<string, ResolvedCommand>();
    const visible = (id: string) => {
      const cmd = commands.resolve(id, documentId ?? undefined);
      if (cmd) resolved.set(id, cmd);
      return cmd?.visible === true;
    };
    return projectStrip(normalized, visible).map((g) => ({
      id: g.id,
      labelKey: g.labelKey,
      commands: g.commands.map((id) => resolved.get(id)!),
    }));
  }, stripGroupsEqual);
  return useMemo(
    () =>
      groups.length === 0
        ? null
        : { groups, execute: (id: string) => commands.execute(id, documentId ?? undefined) },
    [groups, commands, documentId],
  );
}

export interface ToolbarProps {
  bar: BarSchema;
  /** Px between adjacent items (CSS flex gap; the solver budgets the same number). */
  gap?: number;
  /** Width of the separator ELEMENT your renderSeparator draws. Default 1. */
  separatorWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /** A command button at a given variant. Default: a plain <button>. */
  renderCommand?: (cmd: ResolvedCommand, variant: string, run: () => void) => React.ReactNode;
  /**
   * Renderers for custom slots, per named variant. A custom unit with NO
   * entry here renders as a native `<slot name={slot}>` socket with its
   * terminal command as fallback content: in light DOM that displays the
   * fallback (today's behavior); inside a shadow root the host's light-DOM
   * children project into it — the children-as-slots contract. Sockets are
   * measured LIVE (they can't be duplicated into the measurement layer:
   * only the first same-named slot in tree order gets the projected nodes).
   */
  renderCustom?: Record<string, (variant: string, ctx: CustomSlotCtx) => React.ReactNode>;
  /** A group in its collapsed form. Default: <select> for 'select', menu button for 'menu'. */
  renderCollapsed?: (view: CollapsedGroupView) => React.ReactNode;
  /** A shed group's disclosure trigger (+ its popover — the renderer owns the
   *  open state). Default: a chevron button opening a radio menu. */
  renderGroupTrigger?: (view: GroupDisclosureView) => React.ReactNode;
  /** Derived separator between adjacent visible groups. Default: a 1px line. */
  renderSeparator?: () => React.ReactNode;
  renderOverflowTrigger?: (isOpen: boolean, toggle: () => void) => React.ReactNode;
  /** The derived overflow menu. Default: a minimal popover. */
  renderOverflowMenu?: (view: OverflowMenuView) => React.ReactNode;
}

/** Passed to custom-slot renderers alongside the variant. */
export interface CustomSlotCtx {
  /** 'live' = the visible row; 'measure' = the hidden measurement layer. */
  layer: 'live' | 'measure';
  /** Report this unit's width to the solver — for content the measurement
   *  layer can't duplicate. Identity is NOT stable across renders; capture
   *  via ref if used in an effect. */
  measure: (width: number) => void;
}

// ── measurement ───────────────────────────────────────────────────────────────

/** Report this node's border-box width under `k`, live, via ResizeObserver. */
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onWidth(k, el.getBoundingClientRect().width);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [k, onWidth]);
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
 * command). Measured live — the projected content lives in the HOST's world,
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onWidth(k, el.getBoundingClientRect().width);
    report();
    // Projection changes (a child slotted in/out) resize the socket's
    // inline-flex box, so one observer covers both content and assignment.
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [k, onWidth]);
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

// ── defaults (functional, unstyled-ish; products replace them) ───────────────

const defaultRenderCommand = (
  cmd: ResolvedCommand,
  variant: string,
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
      background: cmd.active ? 'rgba(0,0,0,0.12)' : 'transparent',
      border: '1px solid rgba(0,0,0,0.15)',
      borderRadius: 4,
      cursor: cmd.enabled ? 'pointer' : 'default',
      opacity: cmd.enabled ? 1 : 0.4,
    }}
  >
    {variant === 'label' ? cmd.label : (cmd.icon ?? cmd.label)}
    {variant === 'icon+label' ? ` ${cmd.label}` : null}
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
      border: '1px solid rgba(0,0,0,0.15)',
      borderRadius: 4,
      background: isOpen ? 'rgba(0,0,0,0.12)' : 'transparent',
      cursor: 'pointer',
    }}
  >
    ⋯
  </button>
);

function DefaultOverflowMenu({ view }: { view: OverflowMenuView }) {
  if (!view.isOpen) return null;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={view.close} />
      <div
        role="menu"
        style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          zIndex: 41,
          minWidth: 200,
          padding: 4,
          background: 'white',
          border: '1px solid rgba(0,0,0,0.15)',
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        {view.sections.map((section, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.1)', margin: '4px 0' }} />}
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
    </>
  );
}

function DefaultCollapsed({ view }: { view: CollapsedGroupView }) {
  if (view.collapse === 'select') {
    const active = view.commands.find((c) => c.active);
    return (
      <select
        value={active?.id ?? ''}
        onChange={(e) => view.execute(e.target.value)}
        style={{ padding: '4px 6px', borderRadius: 4 }}
      >
        {view.commands.map((c) => (
          <option key={c.id} value={c.id} disabled={!c.enabled}>
            {c.label}
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
  const sections: OverflowSection[] = [
    {
      labelKey: view.labelKey,
      role: view.role === 'tabs' ? 'radio' : undefined,
      rows: view.commands.map((c) => ({ type: 'command' as const, command: c.id })),
    },
  ];
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {defaultRenderOverflowTrigger(isOpen, () => setOpen((o) => !o))}
      <DefaultOverflowMenu
        view={{
          sections,
          isOpen,
          close: () => setOpen(false),
          resolve: (id) => view.commands.find((c) => c.id === id) ?? null,
          execute: view.execute,
        }}
      />
    </span>
  );
}

/** Default shed-group disclosure: a chevron opening a radio menu of the
 *  hidden children — v2's overflow-tabs-button, derived. */
function DefaultGroupTrigger({ view }: { view: GroupDisclosureView }) {
  const [isOpen, setOpen] = useState(false);
  const someActive = view.commands.some((c) => c.active);
  const sections: OverflowSection[] = [
    {
      labelKey: view.labelKey,
      role: view.role === 'tabs' ? 'radio' : undefined,
      rows: view.commands.map((c) => ({ type: 'command' as const, command: c.id })),
    },
  ];
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="More"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 6px',
          border: '1px solid rgba(0,0,0,0.15)',
          borderRadius: 4,
          // hint that the active item is hiding in here
          background: isOpen || someActive ? 'rgba(0,0,0,0.12)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        ▾
      </button>
      <DefaultOverflowMenu
        view={{
          sections,
          isOpen,
          close: () => setOpen(false),
          resolve: (id) => view.commands.find((c) => c.id === id) ?? null,
          execute: view.execute,
        }}
      />
    </span>
  );
}

// ── the toolbar ───────────────────────────────────────────────────────────────

const unitKey = (u: NormalizedUnit, variant: string) => `u:${u.key}@${variant}`;
const groupKey = (id: string) => `g:${id}`;
const groupTriggerKey = (id: string) => `gt:${id}`;
const TRIGGER_KEY = 't:';

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
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1]?.contentRect.width;
      if (w !== undefined) setContainerWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const widthsRef = useRef(new Map<string, number>());
  const [, bumpMeasureVersion] = useReducer((x: number) => x + 1, 0);
  const onWidth = useMemo(
    () => (key: string, width: number) => {
      const prev = widthsRef.current.get(key);
      if (prev !== undefined && Math.abs(prev - width) <= 0.5) return;
      widthsRef.current.set(key, width);
      bumpMeasureVersion();
    },
    [],
  );

  const resolveCmd = (id: string): ResolvedCommand | null =>
    commands.resolve(id, documentId ?? undefined);
  const executeCmd = (id: string) => commands.execute(id, documentId ?? undefined);
  const commandOf = (u: NormalizedUnit) => (u.kind === 'command' ? u.command : u.terminal);

  // Structure → visible structure → fit. Cheap enough to run per render; all
  // heavy lifting is O(items), and items is ~dozens.
  const normalized = useMemo(() => normalizeBar(bar), [bar]);
  // `=== true` and not `!== false`: an UNREGISTERED command resolves to null,
  // and a unit the registry can't name must not render or consume budget —
  // the schema validator's dev warning is the feedback channel, not raw text
  // in the toolbar.
  const visibleBar = filterBar(normalized, (u) => resolveCmd(commandOf(u))?.visible === true);
  const metrics: FitMetrics = {
    unit: (key, variant) => widthsRef.current.get(`u:${key}@${variant}`),
    groupCollapsed: (id) => widthsRef.current.get(groupKey(id)),
    groupTrigger: (id) => widthsRef.current.get(groupTriggerKey(id)),
    overflowTrigger: widthsRef.current.get(TRIGGER_KEY) ?? 32,
    gap,
    // The separator is one extra flex child: its element width plus one flex gap.
    separator: separatorWidth + gap,
  };
  const fit = solve(visibleBar, metrics, containerWidth);
  const overflowSections = projectOverflow(visibleBar, fit, (id) => commands.menuTarget(id));

  const [overflowOpen, setOverflowOpen] = useState(false);
  useEffect(() => {
    if (!fit.hasOverflow) setOverflowOpen(false);
  }, [fit.hasOverflow]);

  /** External = custom unit with no registered renderer → native socket,
   *  live-measured (it must NOT appear in the measurement layer: only the
   *  first same-named <slot> in tree order receives the projected nodes). */
  const isExternalSlot = (u: NormalizedUnit): boolean =>
    u.kind === 'custom' && !renderCustom?.[u.slot];

  // ── unit / group rendering (shared by live row and measure layer) ──────────
  const renderUnitAt = (
    u: NormalizedUnit,
    variant: string,
    layer: 'live' | 'measure',
  ): React.ReactNode => {
    if (u.kind === 'custom') {
      const registered = renderCustom?.[u.slot];
      if (registered) {
        const custom = registered(variant, {
          layer,
          measure: (width) => onWidth(unitKey(u, variant), width),
        });
        if (custom !== undefined) return custom;
      } else if (layer === 'live') {
        const cmd = resolveCmd(u.terminal);
        return (
          <NativeSlotSocket name={u.slot} k={unitKey(u, variant)} onWidth={onWidth}>
            {cmd ? renderCommand(cmd, 'icon', () => executeCmd(u.terminal)) : null}
          </NativeSlotSocket>
        );
      } else {
        return null;
      }
      const cmd = resolveCmd(u.terminal);
      return cmd ? renderCommand(cmd, 'icon', () => executeCmd(u.terminal)) : null;
    }
    const cmd = resolveCmd(u.command);
    if (!cmd)
      return renderCommand(
        {
          id: u.command,
          label: u.command,
          shortcuts: [],
          enabled: false,
          active: false,
          visible: true,
          categories: [],
        },
        variant,
        () => {},
      );
    return renderCommand(cmd, variant, () => executeCmd(u.command));
  };

  const collapsedView = (g: NormalizedGroup): CollapsedGroupView => ({
    id: g.id,
    labelKey: g.labelKey,
    collapse: g.collapse ?? 'menu',
    role: g.role,
    commands: g.units
      .map((u) => resolveCmd(commandOf(u)))
      .filter((c): c is ResolvedCommand => c !== null && c.visible),
    execute: executeCmd,
  });

  const renderCollapsedGroup = (g: NormalizedGroup): React.ReactNode =>
    renderCollapsed ? (
      renderCollapsed(collapsedView(g))
    ) : (
      <DefaultCollapsed view={collapsedView(g)} />
    );

  /** The disclosure view: shed children for the live trigger; the WHOLE group
   *  for the measured trigger, so width is budgeted at its fullest content. */
  const disclosureView = (g: NormalizedGroup, allChildren: boolean): GroupDisclosureView => ({
    id: g.id,
    labelKey: g.labelKey,
    role: g.role,
    commands: g.units
      .filter((u) => allChildren || fit.units.get(u.key)?.kind === 'shed')
      .map((u) => resolveCmd(commandOf(u)))
      .filter((c): c is ResolvedCommand => c !== null && c.visible),
    execute: executeCmd,
  });

  const renderDisclosure = (g: NormalizedGroup, allChildren: boolean): React.ReactNode =>
    renderGroupTrigger ? (
      renderGroupTrigger(disclosureView(g, allChildren))
    ) : (
      <DefaultGroupTrigger view={disclosureView(g, allChildren)} />
    );

  const renderLiveGroup = (g: NormalizedGroup): React.ReactNode[] => {
    const assignment = fit.groups.get(g.id);
    if (!assignment || assignment.overflowed) return [];
    if (assignment.collapsed)
      return [<React.Fragment key={g.id}>{renderCollapsedGroup(g)}</React.Fragment>];
    const nodes: React.ReactNode[] = [];
    for (const u of g.units) {
      const a = fit.units.get(u.key);
      if (a?.kind !== 'variant') continue;
      nodes.push(<React.Fragment key={u.key}>{renderUnitAt(u, a.variant, 'live')}</React.Fragment>);
    }
    // The derived group-local disclosure (v2's overflow-tabs-button).
    if (assignment.shedCount > 0) {
      nodes.push(
        <React.Fragment key={`${g.id}::trigger`}>{renderDisclosure(g, false)}</React.Fragment>,
      );
    }
    return nodes.length ? [<React.Fragment key={g.id}>{nodes}</React.Fragment>] : [];
  };

  const renderLiveSection = (section: NormalizedSection | undefined): React.ReactNode => {
    if (!section) return null;
    const rendered = section.groups
      .map((g) => ({ id: g.id, nodes: renderLiveGroup(g) }))
      .filter((g) => g.nodes.length > 0);
    return rendered.map((g, i) => (
      <React.Fragment key={g.id}>
        {i > 0 && renderSeparator()}
        {g.nodes}
      </React.Fragment>
    ));
  };

  const sectionByName = (name: 'start' | 'center' | 'end') =>
    visibleBar.sections.find((s) => s.name === name);

  /**
   * Segment layout — v2's spacer model, natively. The center segment carries
   * auto margins: it BALANCES in the leftover space (true center when the
   * flanks are symmetric) and yields when they aren't, collapsing to zero
   * before anything can overlap. The container itself has NO gap — segments
   * space themselves — so the solver's global budget (sum of unit widths +
   * per-unit gaps) is exactly the layout's minimum width: what the solver
   * says fits, fits. Its cross-segment gap allowance (≤ 2×gap) becomes slack
   * the auto margins absorb, keeping ≥ gap between segments at the floor.
   * Segments never grow or shrink: fit is the SOLVER's job, not flexbox's.
   */
  const sectionStyle = (position: 'start' | 'center' | 'end'): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap,
    flex: '0 0 auto',
    ...(position === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
  });

  const overflowView: OverflowMenuView = {
    sections: overflowSections,
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
      <div style={sectionStyle('start')}>{renderLiveSection(sectionByName('start'))}</div>
      <div style={sectionStyle('center')}>{renderLiveSection(sectionByName('center'))}</div>
      <div style={sectionStyle('end')}>
        {renderLiveSection(sectionByName('end'))}
        {fit.hasOverflow && (
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            {renderOverflowTrigger(overflowOpen, () => setOverflowOpen((o) => !o))}
            {renderOverflowMenu ? (
              renderOverflowMenu(overflowView)
            ) : (
              <DefaultOverflowMenu view={overflowView} />
            )}
          </span>
        )}
      </div>

      {/* The measurement layer: every unit in every variant, every collapsed
          group form, and the trigger — hidden, inert, observed. Text reflow
          (locale, fonts, zoom) fires the observers; no change-handling code. */}
      <div aria-hidden style={measureLayerStyle}>
        {visibleBar.sections.flatMap((s) =>
          s.groups.flatMap((g) => [
            // External sockets are excluded: they are live-measured, and a
            // duplicate <slot> here would steal the projection from the row.
            ...g.units
              .filter((u) => !isExternalSlot(u))
              .flatMap((u) =>
                u.variants.map((variant) => (
                  <Measured key={unitKey(u, variant)} k={unitKey(u, variant)} onWidth={onWidth}>
                    {renderUnitAt(u, variant, 'measure')}
                  </Measured>
                )),
              ),
            ...(g.collapse
              ? [
                  <Measured key={groupKey(g.id)} k={groupKey(g.id)} onWidth={onWidth}>
                    {renderCollapsedGroup(g)}
                  </Measured>,
                ]
              : []),
            ...(g.shed
              ? [
                  <Measured key={groupTriggerKey(g.id)} k={groupTriggerKey(g.id)} onWidth={onWidth}>
                    {renderDisclosure(g, true)}
                  </Measured>,
                ]
              : []),
          ]),
        )}
        <Measured k={TRIGGER_KEY} onWidth={onWidth}>
          {renderOverflowTrigger(false, () => {})}
        </Measured>
      </div>
    </div>
  );
}
