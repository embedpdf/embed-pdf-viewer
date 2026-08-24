/**
 * Overflow projection — pure. The overflow menu is never authored: it is the
 * complement of the visible set, projected into menu form. The projection is
 * TOTAL because every unit has a canonical menu form by construction:
 *
 *   command                      → command row (label/icon/active resolve live)
 *   command with a `menu` target → submenu row pointing at that menu
 *   custom item                  → its `terminal` command's form
 *   group                        → section (renderers separate sections)
 *   group with `labelKey`        → labeled section (title or nested submenu —
 *                                  presentation is the renderer's choice)
 *   `role: 'tabs'` group         → section marked radio
 *
 * Groups project in bar order; a partially-overflowed group projects only its
 * overflowed units; empty sections vanish. This is what replaces every
 * hand-written overflow/action menu in v2 — same information, one source.
 */
import type { NormalizedBar, NormalizedGroup, NormalizedUnit } from './schema';
import type { FitResult } from './solver';

export type OverflowRow =
  /** A plain command row. The renderer resolves label/icon/active from the registry. */
  | { readonly type: 'command'; readonly command: string }
  /** A command that opens a menu — renders as `label ▸` nesting that menu. */
  | { readonly type: 'submenu'; readonly command: string; readonly menu: string };

export interface OverflowSection {
  /** From the group's labelKey — render as a section title or a nested submenu. */
  readonly labelKey?: string;
  /** 'radio' when the group is a tab strip: exactly one row is active. */
  readonly role?: 'radio';
  readonly rows: readonly OverflowRow[];
}

/**
 * The one fact projection needs about a command: does it open a menu?
 * (Label, icon, and active state stay live in the renderer.) Return null for
 * unknown commands — they project as plain rows and resolve at render time.
 */
export type ResolveMenuTarget = (commandId: string) => { menu?: string } | null;

function projectUnit(unit: NormalizedUnit, resolve: ResolveMenuTarget): OverflowRow {
  // A custom item's menu form is its terminal command's form.
  const command = unit.kind === 'custom' ? unit.terminal : unit.command;
  const menu = resolve(command)?.menu;
  return menu ? { type: 'submenu', command, menu } : { type: 'command', command };
}

export function projectOverflow(
  bar: NormalizedBar,
  fit: FitResult,
  resolve: ResolveMenuTarget,
): OverflowSection[] {
  const sections: OverflowSection[] = [];
  for (const section of bar.sections) {
    for (const group of section.groups) {
      // Shed units are NOT here: they're reachable through the group's own
      // disclosure trigger (projectShed). Only true overflow leaves the group.
      const rows = group.units
        .filter((u) => fit.units.get(u.key)?.kind === 'overflow')
        .map((u) => projectUnit(u, resolve));
      if (rows.length === 0) continue;
      sections.push({
        labelKey: group.labelKey,
        role: group.role === 'tabs' ? 'radio' : undefined,
        rows,
      });
    }
  }
  return sections;
}

/**
 * The content of a group's disclosure trigger: its shed units, in bar order,
 * in menu form — same totality rules as the global overflow. This is v2's
 * hand-written `mode-tabs-overflow-menu`, derived.
 */
export function projectShed(
  group: NormalizedGroup,
  fit: FitResult,
  resolve: ResolveMenuTarget,
): OverflowRow[] {
  return group.units
    .filter((u) => fit.units.get(u.key)?.kind === 'shed')
    .map((u) => projectUnit(u, resolve));
}

/** One strip group: a separator boundary, its visible commands in bar order. */
export interface StripGroup {
  readonly id: string;
  readonly labelKey?: string;
  readonly commands: readonly string[];
}

/**
 * Strip projection — a bar projected for UN-measured rendering (a contextual
 * strip anchored to a selection has no fit pressure to solve). The schema
 * declares what COULD appear; `visible` (the command registry's runtime truth)
 * decides what DOES: hidden commands drop out, groups that empty out vanish,
 * and an all-hidden bar projects to [] — "render nothing" falls out. Custom
 * units project through their `terminal` command, same totality rule as the
 * overflow. Upgrading a strip to measured/overflowing rendering later is a
 * renderer swap (<Toolbar>), never a schema change.
 */
export function projectStrip(
  bar: NormalizedBar,
  visible: (command: string) => boolean,
): StripGroup[] {
  const groups: StripGroup[] = [];
  for (const section of bar.sections) {
    for (const group of section.groups) {
      const commands = group.units
        .map((u) => (u.kind === 'custom' ? u.terminal : u.command))
        .filter(visible);
      if (commands.length === 0) continue;
      groups.push({ id: group.id, labelKey: group.labelKey, commands });
    }
  }
  return groups;
}
