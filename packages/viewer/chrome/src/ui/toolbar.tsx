/**
 * The app's toolbar look — Tailwind render props over the headless <Toolbar>.
 * The app owns the pixels; ui-core owns the physics (measure → solve →
 * overflow). Nothing here knows about breakpoints or widths.
 */
import { MeasurementScaleButton } from './measurement-scale';
import { useEffect, useState } from 'react';
import { VIEW_MODE_COMMAND, groupMenuView, type CustomItem } from '@embedpdf/core-ui';
import { useOptionalCapability, useOptionalSelector } from '@embedpdf/react/runtime';
import { Toolbar } from '@embedpdf/react/toolbar';
import type {
  BarSchema,
  CollapsedGroupView,
  CustomSlotCtx,
  GroupDisclosureView,
  OverflowMenuView,
} from '@embedpdf/react/toolbar';
import { useCommand, useCommands } from '@embedpdf/react/commands';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { TOOLBAR_ITEM_ATTRIBUTE } from '@embedpdf/web';
import { PageNumber } from './page-number';
import { QuickStamps } from './quick-stamps';
import { ViewOnlyLabel } from './view-only';
import { ShellToken } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { StageToken } from '@embedpdf/react/stage';
import { Icon } from './icons';
import { ItemSocket } from './item-socket';
import { MenuAnchor, ToolbarMenu } from './menu';

// ── the Button recipe ─────────────────────────────────────────────────────────
const BTN_BASE =
  'flex h-8 w-auto min-w-8 cursor-pointer items-center justify-center rounded-md p-[5px] transition-colors';
const BTN_HOVER = 'hover:bg-hover hover:ring hover:ring-accent';
const BTN_ACTIVE = 'border-none bg-selected text-accent shadow ring ring-accent';
const BTN_DISABLED = 'cursor-not-allowed opacity-50 hover:bg-transparent hover:ring-0';

export const buttonClass = (active: boolean, enabled = true): string =>
  `${BTN_BASE} ${active ? BTN_ACTIVE : BTN_HOVER} ${enabled ? '' : BTN_DISABLED}`;

/**
 * The part name of a button in a bar, for page CSS through `::part()`: `toolbar-button`, and
 * `toolbar-button-active` too while it's pressed or its menu is open. Part names are public, as
 * the Theming page lists them.
 */
export const buttonPart = (active: boolean): string =>
  active ? 'toolbar-button toolbar-button-active' : 'toolbar-button';

/** The part name of a mode tab: `mode-tab`, and `mode-tab-active` too for the open mode. */
const modeTabPart = (active: boolean): string => (active ? 'mode-tab mode-tab-active' : 'mode-tab');

// ── the TabButton recipe (the underline) ──────────────────────────────────────
const TAB_BASE =
  'flex h-8 w-auto min-w-8 cursor-pointer items-center justify-center rounded-none border-b-2 px-2 py-1 text-sm transition-colors hover:bg-transparent hover:border-b-fg-muted';
const TAB_ACTIVE = 'border-b-accent text-accent hover:border-b-accent';
const TAB_INACTIVE = 'border-b-transparent';

const tabClass = (active: boolean, enabled = true): string =>
  `${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE} ${enabled ? '' : 'cursor-not-allowed opacity-50'}`;

// ── a single command button (icon / icon+label / label=tab) ──────────────────
export function CommandButton({
  cmd,
  variant,
  run,
}: {
  cmd: ResolvedCommand;
  variant: string;
  run: () => void;
}) {
  const isTab = variant === 'label';

  // Buttons carry no caret — a menu command is a plain icon button; the
  // `menu:` declaration still drives aria-haspopup and the anchored popover.
  // A menu command is active while its menu is open at this button: it says it's expanded.
  const draw = (active: boolean) => (
    <button
      type="button"
      onClick={run}
      disabled={!cmd.enabled}
      aria-pressed={cmd.menu ? undefined : active || undefined}
      aria-haspopup={cmd.menu ? 'menu' : undefined}
      aria-expanded={cmd.menu ? active : undefined}
      aria-label={cmd.label}
      // A command the scope doesn't allow, shown under `notAllowed: 'disable'`, says why.
      title={cmd.disabledReason ?? cmd.label}
      part={isTab ? modeTabPart(active) : buttonPart(active)}
      className={isTab ? tabClass(active, cmd.enabled) : buttonClass(active, cmd.enabled)}
    >
      {isTab ? (
        <span className="whitespace-nowrap px-1">{cmd.label}</span>
      ) : variant === 'icon+label' ? (
        <span className="flex items-center whitespace-nowrap text-sm">
          {cmd.icon && (
            <Icon name={cmd.icon} size={20} accent={cmd.iconAccent} className="me-1.5 shrink-0" />
          )}
          <span>{cmd.label}</span>
        </span>
      ) : cmd.icon ? (
        <Icon name={cmd.icon} size={20} accent={cmd.iconAccent} />
      ) : (
        <span className="text-sm">{cmd.label}</span>
      )}
    </button>
  );

  if (!cmd.menu) return draw(cmd.active);
  return <MenuAnchor menuId={cmd.menu}>{draw}</MenuAnchor>;
}

// ── the inline zoom widget ───────────────────────────────────────────────────

/**
 * Makes a control inside an item one more stop of the toolbar's arrow keys: the zoom field's
 * buttons are reached with the arrows, like the bar's own, and the bar stays one Tab stop.
 */
const ARROW_STOP = { [TOOLBAR_ITEM_ATTRIBUTE]: '', className: 'contents' } as Record<
  string,
  string
>;

function ZoomControls() {
  const t = useT();
  const commands = useCommands();
  const zoomIn = useCommand('zoom:in');
  const zoomOut = useCommand('zoom:out');
  const zoomMenu = useCommand('menu:zoom');
  const shell = useOptionalCapability(ShellToken);
  const stage = useOptionalCapability(StageToken);
  // Null-safe: the zoom strip is main-toolbar chrome, mounted before any
  // document exists — it reads 100% until a Stage is there to ask.
  const level = useOptionalSelector(StageToken, (stage) => stage.getZoomLevel(), 1);
  const pct = Math.round((level ?? 1) * 100);
  const [inputValue, setInputValue] = useState(String(pct));
  useEffect(() => setInputValue(String(pct)), [pct]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value > 0) stage?.zoomTo({ level: value / 100 });
  };

  // The zoom menu lines up with the whole field.
  return (
    <MenuAnchor menuId="zoom" className="relative block">
      {(zoomOpen) => (
        <div className="bg-hover flex items-center rounded">
          {/* editable zoom percentage */}
          <form
            onSubmit={submit}
            className="flex min-w-0 flex-nowrap items-center overflow-hidden whitespace-nowrap"
          >
            <input
              name="zoom"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              aria-label={t('commands.zoom.level')}
              className="h-6 w-8 min-w-0 shrink border-0 bg-transparent p-0 text-end text-sm outline-none focus:outline-none"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => {
                if (!inputValue || parseFloat(inputValue) <= 0) setInputValue(String(pct));
              }}
            />
            <span className="shrink-0 text-sm">%</span>
          </form>
          {/* zoom menu chevron */}
          <span {...ARROW_STOP}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={zoomOpen}
              title={zoomMenu.label}
              part={buttonPart(false)}
              className={buttonClass(false)}
              onClick={() => shell?.toggleMenu('zoom')}
            >
              <Icon name="chevronDown" size={20} />
            </button>
          </span>
          <span {...ARROW_STOP}>
            <button
              type="button"
              title={zoomOut.label}
              disabled={!zoomOut.enabled}
              part={buttonPart(false)}
              className={buttonClass(false, zoomOut.enabled)}
              onClick={() => commands.execute('zoom:out')}
            >
              <Icon name="zoomOut" size={20} />
            </button>
          </span>
          <span {...ARROW_STOP}>
            <button
              type="button"
              title={zoomIn.label}
              disabled={!zoomIn.enabled}
              part={buttonPart(false)}
              className={buttonClass(false, zoomIn.enabled)}
              onClick={() => commands.execute('zoom:in')}
            >
              <Icon name="zoomIn" size={20} />
            </button>
          </span>
        </div>
      )}
    </MenuAnchor>
  );
}

/** The 'button' variant of the zoom slot — a single icon that opens the menu. */
function ZoomButton() {
  const shell = useOptionalCapability(ShellToken);
  const zoomMenu = useCommand('menu:zoom');
  return (
    <MenuAnchor menuId="zoom">
      {(zoomOpen) => (
        <button
          type="button"
          title={zoomMenu.label}
          aria-haspopup="menu"
          aria-expanded={zoomOpen}
          part={buttonPart(zoomOpen)}
          className={buttonClass(zoomOpen)}
          onClick={() => shell?.toggleMenu('zoom')}
        >
          <Icon name="zoomIn" size={20} />
        </button>
      )}
    </MenuAnchor>
  );
}

// ── a shed group's in-strip disclosure (derived) ─────────────────────────────
function GroupTrigger({ view }: { view: GroupDisclosureView }) {
  const [open, setOpen] = useState(false);
  // The active tab may be hiding behind the chevron — hint at it, tab-style.
  const activeHidden = view.commands.some((command) => command.active);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        // The chevron the trailing mode tabs fold behind is a tab too; another group's is a button.
        part={view.id === 'modes' ? modeTabPart(activeHidden) : buttonPart(open)}
        className={tabClass(activeHidden)}
      >
        <Icon name="chevronDown" size={18} />
      </button>
      <ToolbarMenu view={groupMenuView(view, open, () => setOpen(false))} />
    </span>
  );
}

// ── the collapsed modes group ────────────────────────────────────────────────
function CollapsedModes({ view }: { view: CollapsedGroupView }) {
  const [open, setOpen] = useState(false);
  const active = view.commands.find((command) => command.active) ?? view.commands[0];
  // The control highlights whenever a non-default mode is active.
  const isActive = Boolean(active?.active && active.id !== VIEW_MODE_COMMAND);
  return (
    <div style={{ width: 100 }} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        part={buttonPart(open)}
        className="bg-surface hover:bg-hover flex w-full cursor-pointer appearance-none items-center rounded-md py-1.5 pe-2 ps-3 text-[13px] transition-colors"
      >
        <span
          className={`min-w-0 flex-1 truncate text-start ${isActive ? 'text-accent' : 'text-fg'}`}
        >
          {active?.label}
        </span>
        <Icon
          name="chevronDown"
          size={16}
          className={isActive ? 'text-accent' : 'text-fg-secondary'}
        />
      </button>
      <ToolbarMenu view={groupMenuView(view, open, () => setOpen(false))} />
    </div>
  );
}

// ── a group folded into one menu button (`collapse: 'menu'`) ─────────────────
function CollapsedMenu({ view }: { view: CollapsedGroupView }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // The button shows the group's current choice, else its first command.
  const shown = view.commands.find((command) => command.active) ?? view.commands[0];
  const label = view.labelKey ? t(view.labelKey) : shown?.label;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        part={buttonPart(open)}
        className={buttonClass(open)}
      >
        {shown?.icon ? (
          <Icon name={shown.icon} size={20} accent={shown.iconAccent} />
        ) : (
          <span className="whitespace-nowrap px-1 text-sm">{label}</span>
        )}
        <Icon name="chevronDown" size={14} className="text-fg-secondary" />
      </button>
      <ToolbarMenu view={groupMenuView(view, open, () => setOpen(false))} />
    </span>
  );
}

// ── the derived overflow menu ────────────────────────────────────────────────
function OverflowMenu({ view }: { view: OverflowMenuView }) {
  // The "More" button is at the bar's end: the menu lines up with it there.
  return <ToolbarMenu view={view} align="end" />;
}

function OverflowTrigger({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      title={t('demo.more')}
      part={buttonPart(isOpen)}
      className={buttonClass(isOpen)}
    >
      <Icon name="dots" size={20} />
    </button>
  );
}

// ── your own items ───────────────────────────────────────────────────────────

/** The custom items in `bar`, in order. */
function customItemsOf(bar: BarSchema): CustomItem[] {
  const groups = [
    ...(bar.sections.start ?? []),
    ...(bar.sections.center ?? []),
    ...(bar.sections.end ?? []),
  ];
  return groups.flatMap((group) =>
    group.items.filter(
      (child): child is CustomItem => typeof child === 'object' && 'slot' in child,
    ),
  );
}

/** What your item stands for while nothing is slotted into it: its command's button. */
function StandIn({ commandId }: { commandId: string }) {
  const command = useCommand(commandId);
  if (!command.visible) return null;
  return <CommandButton cmd={command} variant="icon" run={() => void command.run()} />;
}

// ── the assembled toolbar ────────────────────────────────────────────────────
export function AppToolbar({
  bar,
  orientation = 'horizontal',
  className,
}: {
  bar: BarSchema;
  /** A vertical toolbar (a bar at the start or end edge) draws its commands as icons. */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  const vertical = orientation === 'vertical';
  // The custom items the viewer draws itself.
  const builtIn: Record<string, (variant: string) => React.ReactNode> = {
    'measurement-scale': () => <MeasurementScaleButton />,
    // The zoom field, or its button when there's no room; the field runs across a bar, so a
    // vertical one draws the button.
    zoom: (variant) => (variant === 'button' || vertical ? <ZoomButton /> : <ZoomControls />),
    'quick-stamps': () => <QuickStamps />,
    'page-number': () => <PageNumber />,
    'view-only': (variant) => <ViewOnlyLabel compact={variant === 'icon' || vertical} />,
  };
  // Every other one is yours, slotted in, so the measurement layer can't hold it: its socket is
  // measured where it renders.
  const yours = Object.fromEntries(
    customItemsOf(bar)
      .filter((item) => !Object.prototype.hasOwnProperty.call(builtIn, item.slot))
      .map((item) => [
        item.slot,
        (variant: string, ctx: CustomSlotCtx) =>
          ctx.layer === 'measure' ? null : (
            <ItemSocket
              id={item.slot}
              variant={item.variants ? variant : null}
              orientation={orientation}
              measure={ctx.measure}
            >
              {item.terminal ? <StandIn commandId={item.terminal} /> : null}
            </ItemSocket>
          ),
      ]),
  );
  return (
    <Toolbar
      bar={bar}
      orientation={orientation}
      gap={8} // Tailwind's gap-2
      separatorWidth={1}
      className={className}
      renderCommand={(cmd, variant, run) => <CommandButton cmd={cmd} variant={variant} run={run} />}
      renderCustom={{ ...yours, ...builtIn }}
      renderCollapsed={(view) =>
        view.id === 'modes' ? (
          <CollapsedModes view={view} />
        ) : view.collapse === 'menu' ? (
          <CollapsedMenu view={view} />
        ) : undefined
      }
      renderGroupTrigger={(view) => <GroupTrigger view={view} />}
      renderSeparator={() => (
        <span className={`bg-border self-center ${vertical ? 'h-px w-6' : 'h-6 w-px'}`} />
      )}
      renderOverflowTrigger={(isOpen, toggle) => (
        <OverflowTrigger isOpen={isOpen} toggle={toggle} />
      )}
      renderOverflowMenu={(view) => <OverflowMenu view={view} />}
    />
  );
}
