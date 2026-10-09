/**
 * What a toolbar draws, as data, the same for every framework adapter. The fit
 * decides (`filterBar`, `solve`, `projectOverflow`); `layoutToolbar` turns a
 * fit into the parts an adapter draws, in the live row and in the hidden
 * measurement layer, each with its command already resolved and its run
 * bound. `groupMenuView` is the menu a folded group or a group's trigger
 * opens, and `stripGroupsOf` is a bar resolved for a strip that doesn't fit
 * itself.
 *
 * The command is whatever the app's registry resolves (plugin-commands'
 * `ResolvedCommand`): this package reads only its `id` and `visible`, and
 * hands it back untouched. Adapters call these again on every change and only
 * draw.
 */
import type { NormalizedBar, NormalizedGroup, NormalizedUnit } from './schema';
import { filterBar } from './schema';
import type { FitMetrics, FitResult } from './solver';
import { solve } from './solver';
import type { OverflowSection, ResolveMenuTarget } from './projection';
import { projectOverflow, projectStrip } from './projection';

/** What the layout reads of a resolved command; plugin-commands' `ResolvedCommand` satisfies it. */
export interface ToolbarCommand {
  readonly id: string;
  readonly visible: boolean;
}

// ── the views a drawn part receives ──────────────────────────────────────────

/** A group folded into one control: a menu button, or a `<select>`. */
export interface CollapsedGroupView<Command extends ToolbarCommand = ToolbarCommand> {
  readonly id: string;
  readonly labelKey?: string;
  readonly collapse: 'menu' | 'select';
  readonly role: 'buttons' | 'tabs';
  /** The group's visible commands (a custom item through its terminal command), resolved live. */
  readonly commands: readonly Command[];
  execute(id: string): void;
}

/**
 * The button inside a group that shed some of its items. `commands` is what
 * sits behind it, in bar order, resolved live. In the measurement layer it is
 * measured with the whole group behind it, so a trigger that shows a count
 * ("+3") is budgeted at its widest.
 */
export interface GroupDisclosureView<Command extends ToolbarCommand = ToolbarCommand> {
  readonly id: string;
  readonly labelKey?: string;
  readonly role: 'buttons' | 'tabs';
  readonly commands: readonly Command[];
  execute(id: string): void;
}

/** The "More" menu: what didn't fit, in sections, and the calls a menu needs. */
export interface OverflowMenuView<Command extends ToolbarCommand = ToolbarCommand> {
  readonly sections: readonly OverflowSection[];
  readonly isOpen: boolean;
  close(): void;
  /** A row's command, resolved live, or `null` for an unknown id. */
  resolve(id: string): Command | null;
  execute(id: string): void;
}

/** What a custom item's renderer receives besides the item's variant. */
export interface CustomSlotCtx {
  /** `'live'` in the visible row, `'measure'` in the hidden measurement layer. */
  layer: 'live' | 'measure';
  /** Report the item's width yourself, for content the measurement layer can't hold. */
  measure: (width: number) => void;
}

// ── the parts ────────────────────────────────────────────────────────────────

/**
 * One thing in the toolbar. `key` is its identity in the live row, the same
 * at every variant; `measureKey` is the key its width is reported under,
 * unique across the whole toolbar. A `custom` part is the app's to draw;
 * without a renderer for it, an adapter draws a native `<slot>` socket
 * measured where it renders, and leaves it out of the measurement layer: only
 * the first `<slot>` of a name gets the projected children.
 */
export type ToolbarPart<Command extends ToolbarCommand = ToolbarCommand> =
  | {
      readonly kind: 'command';
      readonly key: string;
      readonly measureKey: string;
      readonly command: Command;
      readonly variant: string;
      readonly run: () => void;
    }
  | {
      readonly kind: 'custom';
      readonly key: string;
      readonly measureKey: string;
      /** The item's name, from `custom(name, terminal)`. */
      readonly name: string;
      readonly variant: string;
      /** The command it becomes in the "More" menu; drawn when no renderer draws the item. */
      readonly terminal: Command | null;
      readonly runTerminal: () => void;
    }
  | {
      readonly kind: 'collapsed';
      readonly key: string;
      readonly measureKey: string;
      readonly view: CollapsedGroupView<Command>;
    }
  | {
      readonly kind: 'disclosure';
      readonly key: string;
      readonly measureKey: string;
      readonly view: GroupDisclosureView<Command>;
    };

/** A group in the live row: its visible parts. Every group but a section's first has a separator before it. */
export interface LiveGroup<Command extends ToolbarCommand = ToolbarCommand> {
  readonly id: string;
  readonly parts: readonly ToolbarPart<Command>[];
}

/** A section of the live row (`start`, `center` or `end`), with only its visible groups. */
export interface LiveSection<Command extends ToolbarCommand = ToolbarCommand> {
  readonly name: 'start' | 'center' | 'end';
  readonly groups: readonly LiveGroup<Command>[];
}

export interface ToolbarLayout<Command extends ToolbarCommand = ToolbarCommand> {
  /** Always the three sections, in order. */
  readonly sections: readonly LiveSection<Command>[];
  /**
   * What the measurement layer draws, each reporting its width under its
   * `measureKey`: every unit in every variant, each collapsible group folded,
   * each shed group's trigger with the whole group behind it.
   */
  readonly measured: readonly ToolbarPart<Command>[];
  readonly hasOverflow: boolean;
  /** The "More" menu, derived from what didn't fit. */
  readonly overflow: readonly OverflowSection[];
}

/** The keys a measurement layer reports widths under; `@embedpdf/web`'s `toolbarMeasureKey` satisfies it. */
export interface ToolbarMeasureKeys {
  unit(unitKey: string, variant: string): string;
  group(groupId: string): string;
  groupTrigger(groupId: string): string;
}

/** What {@link layoutToolbar} reads. */
export interface ToolbarLayoutInput<Command extends ToolbarCommand> {
  /** The bar, from `normalizeBar`. */
  readonly bar: NormalizedBar;
  /** A command for the toolbar's document, or `null` for an id no plugin registered. */
  readonly resolve: (id: string) => Command | null;
  /** What an id no plugin registered draws as: a disabled command named by its id. */
  readonly unregistered: (id: string) => Command;
  /** Run a command for the toolbar's document. */
  readonly execute: (id: string) => void;
  /** Which menu a command opens, for the "More" menu's submenu rows. */
  readonly menuTarget: ResolveMenuTarget;
  /** The measured widths. */
  readonly metrics: FitMetrics;
  /** The keys the measured widths are reported under. */
  readonly measureKey: ToolbarMeasureKeys;
  /** The width the toolbar fills. */
  readonly containerWidth: number;
}

const SECTIONS = ['start', 'center', 'end'] as const;

const commandOf = (unit: NormalizedUnit): string =>
  unit.kind === 'command' ? unit.command : unit.terminal;

/** Fit the bar into `containerWidth` and describe what to draw. */
export function layoutToolbar<Command extends ToolbarCommand>(
  input: ToolbarLayoutInput<Command>,
): ToolbarLayout<Command> {
  const { resolve, execute, measureKey } = input;
  // `=== true` and not `!== false`: an unregistered command resolves to null, and a unit the
  // registry can't name must not render or take room.
  const bar = filterBar(input.bar, (unit) => resolve(commandOf(unit))?.visible === true);
  const fit = solve(bar, input.metrics, input.containerWidth);

  const visibleCommands = (units: readonly NormalizedUnit[]): Command[] =>
    units
      .map((unit) => resolve(commandOf(unit)))
      .filter((command): command is Command => command !== null && command.visible);

  const parts: PartBuilders<Command> = {
    unit: (unit, variant) => {
      if (unit.kind === 'custom') {
        return {
          kind: 'custom',
          key: unit.key,
          measureKey: measureKey.unit(unit.key, variant),
          name: unit.slot,
          variant,
          terminal: resolve(unit.terminal),
          runTerminal: () => execute(unit.terminal),
        };
      }
      const command = resolve(unit.command);
      return {
        kind: 'command',
        key: unit.key,
        measureKey: measureKey.unit(unit.key, variant),
        command: command ?? input.unregistered(unit.command),
        variant,
        run: command ? () => execute(unit.command) : () => {},
      };
    },
    collapsed: (group) => ({
      kind: 'collapsed',
      key: group.id,
      measureKey: measureKey.group(group.id),
      view: {
        id: group.id,
        labelKey: group.labelKey,
        collapse: group.collapse ?? 'menu',
        role: group.role,
        commands: visibleCommands(group.units),
        execute,
      },
    }),
    // The shed children for the live trigger; the whole group for the measured one.
    disclosure: (group, allChildren) => ({
      kind: 'disclosure',
      key: `${group.id}::trigger`,
      measureKey: measureKey.groupTrigger(group.id),
      view: {
        id: group.id,
        labelKey: group.labelKey,
        role: group.role,
        commands: visibleCommands(
          group.units.filter((unit) => allChildren || fit.units.get(unit.key)?.kind === 'shed'),
        ),
        execute,
      },
    }),
  };

  return {
    sections: SECTIONS.map((name) => liveSection(name, bar, fit, parts)),
    measured: measuredParts(bar, parts),
    hasOverflow: fit.hasOverflow,
    overflow: projectOverflow(bar, fit, input.menuTarget),
  };
}

/** How one fit builds each kind of part. */
interface PartBuilders<Command extends ToolbarCommand> {
  unit(unit: NormalizedUnit, variant: string): ToolbarPart<Command>;
  collapsed(group: NormalizedGroup): ToolbarPart<Command>;
  disclosure(group: NormalizedGroup, allChildren: boolean): ToolbarPart<Command>;
}

function liveSection<Command extends ToolbarCommand>(
  name: LiveSection['name'],
  bar: NormalizedBar,
  fit: FitResult,
  parts: PartBuilders<Command>,
): LiveSection<Command> {
  const section = bar.sections.find((each) => each.name === name);
  const groups: LiveGroup<Command>[] = [];
  for (const group of section?.groups ?? []) {
    const assignment = fit.groups.get(group.id);
    if (!assignment || assignment.overflowed) continue;
    if (assignment.collapsed) {
      groups.push({ id: group.id, parts: [parts.collapsed(group)] });
      continue;
    }
    const drawn: ToolbarPart<Command>[] = [];
    for (const unit of group.units) {
      const placed = fit.units.get(unit.key);
      if (placed?.kind === 'variant') drawn.push(parts.unit(unit, placed.variant));
    }
    // The group's own button for the items it shed.
    if (assignment.shedCount > 0) drawn.push(parts.disclosure(group, false));
    if (drawn.length > 0) groups.push({ id: group.id, parts: drawn });
  }
  return { name, groups };
}

function measuredParts<Command extends ToolbarCommand>(
  bar: NormalizedBar,
  parts: PartBuilders<Command>,
): ToolbarPart<Command>[] {
  const measured: ToolbarPart<Command>[] = [];
  for (const section of bar.sections) {
    for (const group of section.groups) {
      for (const unit of group.units) {
        for (const variant of unit.variants) measured.push(parts.unit(unit, variant));
      }
      if (group.collapse) measured.push(parts.collapsed(group));
      if (group.shed) measured.push(parts.disclosure(group, true));
    }
  }
  return measured;
}

/**
 * The menu a default folded group or group trigger opens: one section of the
 * group's commands, a radio group when the group is tabs.
 */
export function groupMenuView<Command extends ToolbarCommand>(
  view: CollapsedGroupView<Command> | GroupDisclosureView<Command>,
  isOpen: boolean,
  close: () => void,
): OverflowMenuView<Command> {
  return {
    sections: [
      {
        labelKey: view.labelKey,
        role: view.role === 'tabs' ? 'radio' : undefined,
        rows: view.commands.map((command) => ({ type: 'command' as const, command: command.id })),
      },
    ],
    isOpen,
    close,
    resolve: (id) => view.commands.find((command) => command.id === id) ?? null,
    execute: (id) => view.execute(id),
  };
}

// ── strips ───────────────────────────────────────────────────────────────────

/** A group of a strip: its visible commands, in bar order. Groups are separator boundaries. */
export interface StripViewGroup<Command extends ToolbarCommand = ToolbarCommand> {
  readonly id: string;
  readonly labelKey?: string;
  readonly commands: readonly Command[];
}

/** A strip, resolved: only visible commands, only groups with one. */
export interface StripView<Command extends ToolbarCommand = ToolbarCommand> {
  readonly groups: readonly StripViewGroup<Command>[];
  /** Run a command for the strip's document. */
  execute(id: string): void;
}

/**
 * A bar as a strip shows it now (`projectStrip`), each command resolved: the
 * schema says what could appear, each command's `visible` decides what does.
 * Empty while nothing applies.
 */
export function stripGroupsOf<Command extends ToolbarCommand>(
  bar: NormalizedBar,
  resolve: (id: string) => Command | null,
): StripViewGroup<Command>[] {
  const resolved = new Map<string, Command>();
  const visible = (id: string) => {
    const command = resolve(id);
    if (command) resolved.set(id, command);
    return command?.visible === true;
  };
  return projectStrip(bar, visible).map((group) => ({
    id: group.id,
    labelKey: group.labelKey,
    commands: group.commands.map((id) => resolved.get(id)!),
  }));
}

/**
 * Whether two resolved strips show the same, group by group and command by
 * command (`sameCommand` is plugin-commands' `resolvedCommandsEqual`): a
 * strip's readers pass it on only when this is false.
 */
export function sameStripGroups<Command extends ToolbarCommand>(
  left: readonly StripViewGroup<Command>[],
  right: readonly StripViewGroup<Command>[],
  sameCommand: (left: Command, right: Command) => boolean,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (group, i) =>
        group.id === right[i]!.id &&
        group.commands.length === right[i]!.commands.length &&
        group.commands.every((command, j) => sameCommand(command, right[i]!.commands[j]!)),
    )
  );
}
