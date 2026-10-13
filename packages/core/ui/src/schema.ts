/**
 * @embedpdf/core-ui — the structure-only bar vocabulary.
 *
 * A bar contains only what a designer decides and the runtime cannot
 * compute: order, grouping, importance, and each item's degradation ladder.
 * Everything the runtime can compute is banned from it by construction:
 * no breakpoints, no show/hide lists, no locale overrides, no dividers, no
 * spacers, no hand-written overflow menus. Fit is measured and solved at
 * runtime (see solver.ts); the overflow menu is derived (see projection.ts).
 * Where bars go, and the menus and panels around them, is the viewer's
 * layout (see layout.ts).
 */

/** Presentation ladder for a command button, richest first. */
export type Variant = 'icon+label' | 'icon' | 'label';

/**
 * Who yields space first. 1 = first to degrade/overflow · 3 = default ·
 * 5 = pinned: may still degrade variants, but never leaves the bar.
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
 * measured like any command button. Its `terminal` command is its menu form,
 * what it becomes when it overflows; an item without one never leaves the bar
 * (it is pinned, and so is its group), which keeps the overflow projection
 * total.
 */
export interface CustomItem {
  readonly slot: string;
  /** Named presentation variants, richest first. Default: ['default']. */
  readonly variants?: readonly string[];
  /** The command that stands in for this slot in menus (its last resort). */
  readonly terminal?: string;
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
   * Stage 1 of the group degradation ladder: under pressure, move trailing
   * children (rightmost first, at the child's importance) into a derived
   * group-local disclosure — a trigger rendered inside the group opening a
   * menu of the hidden children. Never sheds the last visible child: below
   * that floor the group `collapse`s (stage 2) or overflows whole. The
   * disclosure is computed, never authored.
   */
  readonly shed?: boolean;
  /**
   * Stage 2: what the whole group degrades to once its children have
   * exhausted their ladders (and shedding, if enabled, has hit its floor): a
   * single menu button or a select-style picker. Groups with neither `shed`
   * nor `collapse` send children to the global overflow menu one by one.
   */
  readonly collapse?: 'menu' | 'select';
  readonly importance?: Importance;
  /**
   * Shows only while something that isn't dependent shows in the same bar, like undo and redo
   * beside a mode's tools: a bar with only dependent groups left shows nothing.
   */
  readonly dependent?: boolean;
  readonly items: readonly BarChild[];
}

/**
 * Alignment regions. Separators derive between adjacent visible groups
 * within a section — never across sections, never from schema data.
 *
 * The names are direction-aware (RTL flips start/end) and `center` is a
 * soft contract: "balance this segment in the space left over by start and
 * end". With symmetric flanks that coincides with true centering; with a
 * heavy flank the segment drifts rather than fights — segments never
 * overlap, matching how every toolbar convention (including spacer-flanked
 * tabs) treats its middle region. Strict geometric centering
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

// ── authoring sugar ───────────────────────────────────────────────────────────

/** A command button: `item('zoom:in', { variants: ['icon+label', 'icon'] })`. */
export function item(command: string, options?: Omit<BarItem, 'command'>): BarItem {
  return { command, ...options };
}

/**
 * An item you draw yourself, by its slot name, and the command it becomes in the "More" menu:
 * `custom('page-number', 'page:go-to', { variants: ['full', 'compact'] })`. Without a command,
 * the item never leaves the bar.
 */
export function custom(
  slot: string,
  terminal?: string,
  options?: Omit<CustomItem, 'slot' | 'terminal'>,
): CustomItem {
  return terminal === undefined ? { slot, ...options } : { slot, terminal, ...options };
}

/** A group of items, with a separator between groups: `group('zoom', ['zoom:out', 'zoom:in'])`. */
export function group(
  id: string,
  items: readonly BarChild[],
  options?: Omit<BarGroup, 'id' | 'items'>,
): BarGroup {
  return { id, ...options, items };
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
      /**
       * The command it becomes in menus, or null for an item without one, which
       * {@link filterBar} keeps, pinned.
       */
      readonly terminal: string | null;
      readonly importance: Importance;
    };

export interface NormalizedGroup {
  readonly id: string;
  readonly labelKey?: string;
  readonly role: 'buttons' | 'tabs';
  readonly shed: boolean;
  readonly collapse?: 'menu' | 'select';
  readonly importance: Importance;
  /** See {@link BarGroup.dependent}; the rule is {@link hasVisibleUnits}. */
  readonly dependent: boolean;
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

/** Whether a unit is a custom item with no command to become in menus: it never leaves the bar. */
export const isStandaloneUnit = (unit: NormalizedUnit): boolean =>
  unit.kind === 'custom' && unit.terminal === null;

/** The command a unit runs: its own, or a custom item's `terminal`; null for a standalone item. */
export const commandOfUnit = (unit: NormalizedUnit): string | null =>
  unit.kind === 'command' ? unit.command : unit.terminal;

function normalizeChild(groupId: string, child: BarChild, seen: Set<string>): NormalizedUnit {
  const asItem: BarItem | CustomItem = typeof child === 'string' ? { command: child } : child;
  const unit: NormalizedUnit =
    'slot' in asItem
      ? {
          kind: 'custom',
          key: `${groupId}:${asItem.slot}`,
          slot: asItem.slot,
          variants: asItem.variants ?? DEFAULT_CUSTOM_VARIANTS,
          terminal: asItem.terminal ?? null,
          importance:
            asItem.terminal === undefined ? PINNED : (asItem.importance ?? DEFAULT_IMPORTANCE),
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

/**
 * Resolve shorthands + defaults; validate uniqueness. Solver/projection input.
 * A group holding a custom item without a command is pinned with it: it never
 * collapses or overflows whole, so the item stays in the bar.
 */
export function normalizeBar(bar: BarSchema): NormalizedBar {
  const seen = new Set<string>();
  const groupIds = new Set<string>();
  const sections: NormalizedSection[] = [];
  for (const name of ['start', 'center', 'end'] as const) {
    const groups = bar.sections[name];
    if (!groups || groups.length === 0) continue;
    sections.push({
      name,
      groups: groups.map((group) => {
        if (groupIds.has(group.id))
          throw new Error(`[ui-core] duplicate group in bar: ${group.id}`);
        groupIds.add(group.id);
        const units = group.items.map((child) => normalizeChild(group.id, child, seen));
        return {
          id: group.id,
          labelKey: group.labelKey,
          role: group.role ?? 'buttons',
          shed: group.shed ?? false,
          collapse: group.collapse,
          importance: units.some(isStandaloneUnit)
            ? PINNED
            : (group.importance ?? DEFAULT_IMPORTANCE),
          dependent: group.dependent === true,
          units,
        };
      }),
    });
  }
  return { id: bar.id, sections };
}

/**
 * Drop units whose command is currently invisible (permissions, disabled
 * categories, contextual visibility) before solving — an invisible unit must
 * not consume budget or appear in the overflow. Groups that empty out vanish
 * naturally in the solver's separator math and in the projection. A custom
 * item without a command has nothing to ask `keep` about, and stays. A bar
 * that shows nothing ({@link hasVisibleUnits}) keeps no unit at all, so its
 * dependent groups go too.
 */
export function filterBar(
  bar: NormalizedBar,
  keep: (unit: NormalizedUnit) => boolean,
): NormalizedBar {
  const shows = hasVisibleUnits(bar, keep);
  return {
    id: bar.id,
    sections: bar.sections.map((section) => ({
      name: section.name,
      groups: section.groups.map((group) => ({
        ...group,
        units: shows ? group.units.filter((unit) => isStandaloneUnit(unit) || keep(unit)) : [],
      })),
    })),
  };
}

/**
 * Whether the bar shows anything once `keep` (as for {@link filterBar}) has had its say: a unit
 * left in a group that isn't dependent. Dependent groups show only beside one, so a bar with
 * only dependent groups left shows nothing.
 */
export function hasVisibleUnits(
  bar: NormalizedBar,
  keep: (unit: NormalizedUnit) => boolean,
): boolean {
  return bar.sections.some((section) =>
    section.groups.some(
      (group) =>
        !group.dependent && group.units.some((unit) => isStandaloneUnit(unit) || keep(unit)),
    ),
  );
}
