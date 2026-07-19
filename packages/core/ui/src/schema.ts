/**
 * @embedpdf/core-ui — the structure-only schema vocabulary.
 *
 * The schema contains ONLY what a designer decides and the runtime cannot
 * compute: order, grouping, importance, and each item's degradation ladder.
 * Everything the runtime CAN compute is banned from it by construction:
 * no breakpoints, no show/hide lists, no locale overrides, no dividers, no
 * spacers, no hand-written overflow menus. Fit is measured and solved at
 * runtime (see solver.ts); the overflow menu is derived (see projection.ts).
 */

/** Presentation ladder for a command button, richest first. */
export type Variant = 'icon+label' | 'icon' | 'label';

/**
 * Who yields space first. 1 = first to degrade/overflow · 3 = default ·
 * 5 = pinned: may still degrade variants, but NEVER leaves the bar.
 */
export type Importance = 1 | 2 | 3 | 4 | 5;

export const PINNED: Importance = 5;

export interface BarItem {
  /** The command this button runs — the only required field. */
  readonly command: string;
  /** Degradation ladder, richest first. Default: ['icon']. */
  readonly variants?: readonly Variant[];
  readonly importance?: Importance;
}

/**
 * An app-rendered slot (e.g. the inline zoom strip). Each named variant is
 * measured like any command button. The ladder MUST terminate in a command
 * (`terminal`) so the item always has a menu form when it overflows — this
 * is what makes the overflow projection total.
 */
export interface CustomItem {
  readonly slot: string;
  /** Named presentation variants, richest first. Default: ['default']. */
  readonly variants?: readonly string[];
  /** The command that stands in for this slot in menus (its last resort). */
  readonly terminal: string;
  readonly importance?: Importance;
}

export type BarChild = BarItem | CustomItem | string; // string = { command }

export interface BarGroup {
  readonly id: string;
  /** Titles the group's menu form (labeled submenu / section heading). */
  readonly labelKey?: string;
  /** Presentation hint: 'tabs' renders as a tab strip and projects as radio rows. */
  readonly role?: 'buttons' | 'tabs';
  /**
   * Stage 1 of the GROUP degradation ladder: under pressure, move trailing
   * children (rightmost first, at the CHILD's importance) into a derived
   * group-local disclosure — a trigger rendered inside the group opening a
   * menu of the hidden children. Never sheds the last visible child: below
   * that floor the group `collapse`s (stage 2) or overflows whole. This is
   * v2's `overflow-tabs-button`, computed instead of authored.
   */
  readonly shed?: boolean;
  /**
   * Stage 2: what the WHOLE group degrades to once its children have
   * exhausted their ladders (and shedding, if enabled, has hit its floor): a
   * single menu button or a select-style picker. Groups with neither `shed`
   * nor `collapse` send children to the global overflow menu one by one.
   */
  readonly collapse?: 'menu' | 'select';
  readonly importance?: Importance;
  readonly items: readonly BarChild[];
}

/**
 * Alignment regions. Separators derive between adjacent visible groups
 * within a section — never across sections, never from schema data.
 *
 * The names are direction-aware (RTL flips start/end) and `center` is a
 * SOFT contract: "balance this segment in the space left over by start and
 * end". With symmetric flanks that coincides with true centering; with a
 * heavy flank the segment drifts rather than fights — segments never
 * overlap, matching how every toolbar convention (including v2's
 * spacer-flanked tabs) treats its middle region. Strict geometric centering
 * would be a solver concern (a tighter budget: 2×max(start,end)+center),
 * deliberately not offered until a product needs it.
 */
export interface BarSections {
  readonly start?: readonly BarGroup[];
  readonly center?: readonly BarGroup[];
  readonly end?: readonly BarGroup[];
}

export interface BarSchema {
  readonly id: string;
  readonly sections: BarSections;
}

/** A run of command rows; separators derive between sections. */
export interface MenuSection {
  /** Optional section heading (i18n key). */
  readonly labelKey?: string;
  readonly items: readonly string[];
}

export interface MenuSchema {
  readonly id: string;
  readonly sections: readonly MenuSection[];
}

export interface ChromeSchema {
  /** Standalone bars (e.g. the main toolbar). */
  readonly bars: Readonly<Record<string, BarSchema>>;
  /** Secondary bars keyed by tool mode — WHICH one shows is derived from the
   *  interaction hub's active tool, never stored. */
  readonly modeBars?: Readonly<Record<string, BarSchema>>;
  /** Named dropdown menus referenced by commands' `menu:` targets. */
  readonly menus?: Readonly<Record<string, MenuSchema>>;
  /** Contextual strips (selection menus) — same BarSchema, same fit engine. */
  readonly strips?: Readonly<Record<string, BarSchema>>;
}

// ── authoring sugar ───────────────────────────────────────────────────────────

export function item(command: string, opts?: Omit<BarItem, 'command'>): BarItem {
  return { command, ...opts };
}

export function custom(slot: string, opts: Omit<CustomItem, 'slot'>): CustomItem {
  return { slot, ...opts };
}

export function group(id: string, items: readonly BarChild[]): BarGroup;
export function group(
  id: string,
  opts: Omit<BarGroup, 'id' | 'items'> & { items?: readonly BarChild[] },
  items?: readonly BarChild[],
): BarGroup;
export function group(
  id: string,
  optsOrItems:
    | readonly BarChild[]
    | (Omit<BarGroup, 'id' | 'items'> & { items?: readonly BarChild[] }),
  items?: readonly BarChild[],
): BarGroup {
  if (Array.isArray(optsOrItems)) return { id, items: optsOrItems as readonly BarChild[] };
  const { items: optItems, ...opts } = optsOrItems as Omit<BarGroup, 'id' | 'items'> & {
    items?: readonly BarChild[];
  };
  return { id, ...opts, items: items ?? optItems ?? [] };
}

// ── normalized form — what the solver and projection consume ─────────────────

export type NormalizedUnit =
  | {
      readonly kind: 'command';
      /** Unique within the bar: `${groupId}:${command}`. Measurement + assignment key. */
      readonly key: string;
      readonly command: string;
      readonly variants: readonly string[];
      readonly importance: Importance;
    }
  | {
      readonly kind: 'custom';
      readonly key: string;
      readonly slot: string;
      readonly variants: readonly string[];
      readonly terminal: string;
      readonly importance: Importance;
    };

export interface NormalizedGroup {
  readonly id: string;
  readonly labelKey?: string;
  readonly role: 'buttons' | 'tabs';
  readonly shed: boolean;
  readonly collapse?: 'menu' | 'select';
  readonly importance: Importance;
  readonly units: readonly NormalizedUnit[];
}

export interface NormalizedSection {
  readonly name: 'start' | 'center' | 'end';
  readonly groups: readonly NormalizedGroup[];
}

export interface NormalizedBar {
  readonly id: string;
  readonly sections: readonly NormalizedSection[];
}

export const DEFAULT_IMPORTANCE: Importance = 3;
const DEFAULT_COMMAND_VARIANTS: readonly Variant[] = ['icon'];
const DEFAULT_CUSTOM_VARIANTS: readonly string[] = ['default'];

function normalizeChild(groupId: string, child: BarChild, seen: Set<string>): NormalizedUnit {
  const asItem: BarItem | CustomItem = typeof child === 'string' ? { command: child } : child;
  const unit: NormalizedUnit =
    'slot' in asItem
      ? {
          kind: 'custom',
          key: `${groupId}:${asItem.slot}`,
          slot: asItem.slot,
          variants: asItem.variants ?? DEFAULT_CUSTOM_VARIANTS,
          terminal: asItem.terminal,
          importance: asItem.importance ?? DEFAULT_IMPORTANCE,
        }
      : {
          kind: 'command',
          key: `${groupId}:${asItem.command}`,
          command: asItem.command,
          variants: asItem.variants ?? DEFAULT_COMMAND_VARIANTS,
          importance: asItem.importance ?? DEFAULT_IMPORTANCE,
        };
  if (unit.variants.length === 0) throw new Error(`[ui-core] empty variant ladder: ${unit.key}`);
  if (seen.has(unit.key)) throw new Error(`[ui-core] duplicate unit in bar: ${unit.key}`);
  seen.add(unit.key);
  return unit;
}

/** Resolve shorthands + defaults; validate uniqueness. Solver/projection input. */
export function normalizeBar(bar: BarSchema): NormalizedBar {
  const seen = new Set<string>();
  const groupIds = new Set<string>();
  const sections: NormalizedSection[] = [];
  for (const name of ['start', 'center', 'end'] as const) {
    const groups = bar.sections[name];
    if (!groups || groups.length === 0) continue;
    sections.push({
      name,
      groups: groups.map((g) => {
        if (groupIds.has(g.id)) throw new Error(`[ui-core] duplicate group in bar: ${g.id}`);
        groupIds.add(g.id);
        return {
          id: g.id,
          labelKey: g.labelKey,
          role: g.role ?? 'buttons',
          shed: g.shed ?? false,
          collapse: g.collapse,
          importance: g.importance ?? DEFAULT_IMPORTANCE,
          units: g.items.map((c) => normalizeChild(g.id, c, seen)),
        };
      }),
    });
  }
  return { id: bar.id, sections };
}

/**
 * Drop units whose command is currently invisible (permissions, disabled
 * categories, contextual visibility) BEFORE solving — an invisible unit must
 * not consume budget or appear in the overflow. Groups that empty out vanish
 * naturally in the solver's separator math and in the projection.
 */
export function filterBar(
  bar: NormalizedBar,
  keep: (unit: NormalizedUnit) => boolean,
): NormalizedBar {
  return {
    id: bar.id,
    sections: bar.sections.map((s) => ({
      name: s.name,
      groups: s.groups.map((g) => ({ ...g, units: g.units.filter(keep) })),
    })),
  };
}

/**
 * Identity + validation. Checks what is checkable without a command registry:
 * bars normalize cleanly, and every `menu` a strip/bar could reference exists
 * is left to `validateChrome` (which also takes the known command ids).
 */
export function defineChrome<T extends ChromeSchema>(chrome: T): T {
  for (const bar of Object.values(chrome.bars)) normalizeBar(bar);
  for (const bar of Object.values(chrome.modeBars ?? {})) normalizeBar(bar);
  for (const strip of Object.values(chrome.strips ?? {})) normalizeBar(strip);
  return chrome;
}

/** Dev-time cross-check: every command referenced by the chrome exists. */
export function validateChrome(chrome: ChromeSchema, knownCommands: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const checkBar = (bar: BarSchema, where: string) => {
    for (const section of normalizeBar(bar).sections)
      for (const g of section.groups)
        for (const u of g.units) {
          const refs = u.kind === 'command' ? [u.command] : [u.terminal];
          for (const c of refs)
            if (!knownCommands.has(c)) problems.push(`${where}: unknown command "${c}"`);
        }
  };
  for (const [id, bar] of Object.entries(chrome.bars)) checkBar(bar, `bars.${id}`);
  for (const [id, bar] of Object.entries(chrome.modeBars ?? {})) checkBar(bar, `modeBars.${id}`);
  for (const [id, strip] of Object.entries(chrome.strips ?? {})) checkBar(strip, `strips.${id}`);
  for (const [id, menu] of Object.entries(chrome.menus ?? {}))
    for (const section of menu.sections)
      for (const c of section.items)
        if (!knownCommands.has(c)) problems.push(`menus.${id}: unknown command "${c}"`);
  return problems;
}
