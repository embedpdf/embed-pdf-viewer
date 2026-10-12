/**
 * The modes a layout brings. A mode is an exclusive shell surface tagged
 * `'mode'` (`mode:<mode>`); the bars with that `mode` show while it is open.
 * The built-in modes have commands of their own (config/commands.ts); a bar
 * with a new mode gets one here, titled by the bar's title.
 */
import type { LayoutData } from '@embedpdf/core-ui';
import { barsInMode, modeCommandOf, modesOf } from '@embedpdf/core-ui';
import type { CommandDef } from '@embedpdf/react/commands';
import { InteractionToken } from '@embedpdf/react/interaction';
import { ShellToken, type ShellCapability } from '@embedpdf/react/shell';

/** The exclusivity tag every mode surface opens with. */
export const MODE_TAG = 'mode';

/** The open mode's surface (`mode:<mode>`), or `null` while viewing. */
export function openModeSurfaceOf(shell: ShellCapability): string | null {
  return shell.listOpenSurfaces().find((surface) => surface.exclusive === MODE_TAG)?.id ?? null;
}

/** A mode, and the title of its first bar that has one. */
export interface ModeSpec {
  readonly mode: string;
  readonly title?: string;
  readonly titleKey?: string;
}

/** The layout's modes, in bar order, each titled by its first bar with a title. */
export function modeSpecsOf(data: LayoutData): ModeSpec[] {
  return modesOf(data).map((mode) => {
    const titled = barsInMode(data, mode)
      .map((barId) => data.bars![barId]!)
      .find((bar) => bar.title !== undefined || bar.titleKey !== undefined);
    return { mode, title: titled?.title, titleKey: titled?.titleKey };
  });
}

/** Whether two lists of modes are the same, title for title. */
export const sameModeSpecs = (left: readonly ModeSpec[], right: readonly ModeSpec[]): boolean =>
  left.length === right.length &&
  left.every(
    (spec, i) =>
      spec.mode === right[i]!.mode &&
      spec.title === right[i]!.title &&
      spec.titleKey === right[i]!.titleKey,
  );

/**
 * A command for each mode that has none yet (`isTaken` says which ids do): it opens the mode,
 * or closes it when it is open, and shows the default pointer. Without a title, its tab reads
 * the mode's own name.
 */
export function modeCommandsFor(
  specs: readonly ModeSpec[],
  isTaken: (id: string) => boolean,
): CommandDef[] {
  return specs
    .filter((spec) => !isTaken(modeCommandOf(spec.mode)))
    .map((spec) => {
      const id = modeCommandOf(spec.mode);
      return {
        id,
        label: spec.title ?? (spec.titleKey === undefined ? spec.mode : undefined),
        labelKey: spec.titleKey,
        run: (commandContext) => {
          const shell = commandContext.tryGet(ShellToken);
          shell?.toggle(id, { exclusive: MODE_TAG });
          commandContext.tryGet(InteractionToken)?.activateTool('pointer');
        },
        active: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen(id) ?? false,
      };
    });
}
