/**
 * The floating strip's pixels, shared by every contextual strip (annotation
 * selection, text selection, …): a rounded toolbar of command buttons with
 * derived group separators. The where is each strip's menu component
 * (`<AnnotationMenu>`, `<SelectionMenu>`); the which is the commands'
 * `visible`/`enabled` derivations via `useStripView`. This file only draws.
 *
 * The text strip sits above what's selected and the annotation strip below it,
 * each on the other side when there's no room, so a menu from one opens on the
 * strip's side, away from the selection (the `selection` edge); it flips when
 * there's no room there. Each strip is a
 * `toolbar` part and its buttons `toolbar-button` parts, like any bar's.
 */
import type { Emphasis } from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import type { BarSchema, useStripView } from '@embedpdf/react/toolbar';
import { Fragment, useMemo } from 'react';

import { BarEdgeProvider } from './bar-edge';
import { Icon, readingDirectionClass } from './icons';
import { MenuAnchor } from './menu';
import { barPartOf, buttonClass, buttonPart, commandTooltipOf, primaryCommandsOf } from './toolbar';
import { useTooltip } from './tooltip';

function StripButton({
  cmd,
  run,
  emphasis,
}: {
  cmd: ResolvedCommand;
  run: () => void;
  emphasis?: Emphasis;
}) {
  const tooltip = useTooltip(commandTooltipOf(cmd));
  // A menu command is active while its menu is open at this button: it says it's expanded.
  const draw = (active: boolean) => (
    <>
      <button
        {...tooltip.trigger}
        type="button"
        onClick={run}
        disabled={!cmd.enabled}
        aria-pressed={cmd.menu ? undefined : active || undefined}
        aria-haspopup={cmd.menu ? 'menu' : undefined}
        aria-expanded={cmd.menu ? active : undefined}
        aria-label={cmd.label}
        part={buttonPart(active, emphasis)}
        className={buttonClass(active, cmd.enabled, emphasis)}
      >
        {cmd.icon && (
          <Icon
            name={cmd.icon}
            size={20}
            accent={cmd.iconAccent}
            className={readingDirectionClass(cmd.icon)}
          />
        )}
      </button>
      {tooltip.element}
    </>
  );
  if (!cmd.menu) return draw(cmd.active);
  return <MenuAnchor menuId={cmd.menu}>{draw}</MenuAnchor>;
}

export function StripBar({
  bar,
  view,
  label,
}: {
  /** The bar the strip draws: its id names its part, its items say which buttons are primary. */
  bar: BarSchema;
  view: NonNullable<ReturnType<typeof useStripView>>;
  label: string;
}) {
  const primary = useMemo(() => primaryCommandsOf(bar), [bar]);
  return (
    <BarEdgeProvider value="selection">
      <div
        role="toolbar"
        aria-label={label}
        part={barPartOf(bar.id)}
        className="border-border-subtle bg-elevated flex items-center gap-1 rounded-lg border p-1 shadow-xl"
      >
        {view.groups.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 && <span aria-hidden className="bg-border h-5 w-px" />}
            {group.commands.map((cmd) => (
              <StripButton
                key={cmd.id}
                cmd={cmd}
                run={() => view.execute(cmd.id)}
                emphasis={primary.has(cmd.id) ? 'primary' : undefined}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </BarEdgeProvider>
  );
}
