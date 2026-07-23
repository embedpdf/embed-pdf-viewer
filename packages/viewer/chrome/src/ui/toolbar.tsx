/**
 * The app's toolbar look — Tailwind render props over the headless <Toolbar>.
 * The app owns the pixels; ui-core owns the physics (measure → solve →
 * overflow). Nothing here knows about breakpoints or widths.
 *
 * Styling is a 1:1 port of the v2 snippet's components:
 *   Button      → viewers/snippet/src/components/ui/button.tsx
 *   TabButton   → viewers/snippet/src/components/ui/tab-button.tsx (underline)
 *   zoom widget → viewers/snippet/src/components/custom-zoom-toolbar.tsx
 *   mode select → viewers/snippet/src/components/mode-select-button.tsx
 */
import { useEffect, useState } from 'react';
import { useOptionalCapability, useOptionalSelector } from '@embedpdf/react/runtime';
import { Toolbar } from '@embedpdf/react/toolbar';
import type {
  BarSchema,
  CollapsedGroupView,
  GroupDisclosureView,
  OverflowMenuView,
} from '@embedpdf/react/toolbar';
import { useCommands } from '@embedpdf/react/commands';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { useMenus } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { StageToken } from '@embedpdf/react/stage';
import { Icon } from './icons';
import { MenuBody, Popover, InlineSubmenu } from './menu';

// ── the v2 Button recipe ──────────────────────────────────────────────────────
const BTN_BASE =
  'flex h-8 w-auto min-w-8 cursor-pointer items-center justify-center rounded-md p-[5px] transition-colors';
const BTN_HOVER = 'hover:bg-hover hover:ring hover:ring-accent';
const BTN_ACTIVE = 'border-none bg-selected text-accent shadow ring ring-accent';
const BTN_DISABLED = 'cursor-not-allowed opacity-50 hover:bg-transparent hover:ring-0';

export const buttonClass = (active: boolean, enabled = true): string =>
  `${BTN_BASE} ${active ? BTN_ACTIVE : BTN_HOVER} ${enabled ? '' : BTN_DISABLED}`;

// ── the v2 TabButton recipe (the underline) ───────────────────────────────────
const TAB_BASE =
  'flex h-8 w-auto min-w-8 cursor-pointer items-center justify-center rounded-none border-b-2 px-2 py-1 text-sm transition-colors hover:bg-transparent hover:border-b-fg-muted';
const TAB_ACTIVE = 'border-b-accent text-accent hover:border-b-accent';
const TAB_INACTIVE = 'border-b-transparent';

const tabClass = (active: boolean, enabled = true): string =>
  `${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE} ${enabled ? '' : 'cursor-not-allowed opacity-50'}`;

// ── a single command button (icon / icon+label / label=tab) ──────────────────
function CommandButton({
  cmd,
  variant,
  run,
}: {
  cmd: ResolvedCommand;
  variant: string;
  run: () => void;
}) {
  const isTab = variant === 'label';

  // v2 buttons carry NO caret — a menu command is a plain icon button; the
  // `menu:` declaration still drives aria-haspopup and the anchored popover.
  const button = (
    <button
      type="button"
      onClick={run}
      disabled={!cmd.enabled}
      aria-pressed={cmd.active || undefined}
      aria-haspopup={cmd.menu ? 'menu' : undefined}
      aria-label={cmd.label}
      title={cmd.label}
      className={isTab ? tabClass(cmd.active, cmd.enabled) : buttonClass(cmd.active, cmd.enabled)}
    >
      {isTab ? (
        <span className="whitespace-nowrap px-1">{cmd.label}</span>
      ) : variant === 'icon+label' ? (
        <span className="flex items-center whitespace-nowrap text-sm">
          {cmd.icon && (
            <Icon name={cmd.icon} size={20} accent={cmd.iconAccent} className="mr-1.5 shrink-0" />
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

  if (!cmd.menu) return button;
  return <MenuAnchoredButton cmd={cmd}>{button}</MenuAnchoredButton>;
}

function MenuAnchoredButton({
  cmd,
  children,
}: {
  cmd: ResolvedCommand;
  children: React.ReactNode;
}) {
  const menus = useMenus();
  const open = cmd.menu ? menus.isOpen(cmd.menu) : false;
  return (
    <span className="relative inline-flex">
      {children}
      {open && cmd.menu && (
        <Popover onClose={() => menus.close(cmd.menu!)}>
          <MenuBody menuId={cmd.menu} onRun={() => menus.close(cmd.menu!)} />
        </Popover>
      )}
    </span>
  );
}

// ── the inline zoom widget — v2's custom-zoom-toolbar, 1:1 ───────────────────
function ZoomControls() {
  const commands = useCommands();
  const menus = useMenus();
  const stage = useOptionalCapability(StageToken);
  // Null-safe: the zoom strip is main-toolbar chrome, mounted before any
  // document exists — it reads 100% until a Stage is there to ask.
  const level = useOptionalSelector(StageToken, (c) => c.zoomLevel(), 1);
  const pct = Math.round((level ?? 1) * 100);
  const [inputValue, setInputValue] = useState(String(pct));
  useEffect(() => setInputValue(String(pct)), [pct]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value > 0) stage?.zoomTo({ level: value / 100 });
  };

  return (
    <div className="relative">
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
            aria-label="Set zoom"
            className="h-6 w-8 min-w-0 shrink border-0 bg-transparent p-0 text-right text-sm outline-none focus:outline-none"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => {
              if (!inputValue || parseFloat(inputValue) <= 0) setInputValue(String(pct));
            }}
          />
          <span className="shrink-0 text-sm">%</span>
        </form>
        {/* zoom menu chevron */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menus.isOpen('zoom')}
          title="Zoom options"
          className={buttonClass(false)}
          onClick={() => menus.toggle('zoom')}
        >
          <Icon name="chevronDown" size={20} />
        </button>
        <button
          type="button"
          title="Zoom out"
          className={buttonClass(false)}
          onClick={() => commands.execute('zoom:out')}
        >
          <Icon name="zoomOut" size={20} />
        </button>
        <button
          type="button"
          title="Zoom in"
          className={buttonClass(false)}
          onClick={() => commands.execute('zoom:in')}
        >
          <Icon name="zoomIn" size={20} />
        </button>
      </div>
      {menus.isOpen('zoom') && (
        <Popover onClose={() => menus.close('zoom')}>
          <MenuBody menuId="zoom" onRun={() => menus.close('zoom')} />
        </Popover>
      )}
    </div>
  );
}

/** The 'button' variant of the zoom slot — a single icon that opens the menu. */
function ZoomButton() {
  const menus = useMenus();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        title="Zoom"
        aria-haspopup="menu"
        aria-expanded={menus.isOpen('zoom')}
        className={buttonClass(menus.isOpen('zoom'))}
        onClick={() => menus.toggle('zoom')}
      >
        <Icon name="zoomIn" size={20} />
      </button>
      {menus.isOpen('zoom') && (
        <Popover onClose={() => menus.close('zoom')}>
          <MenuBody menuId="zoom" onRun={() => menus.close('zoom')} />
        </Popover>
      )}
    </span>
  );
}

// ── a shed group's in-strip disclosure (v2's overflow-tabs-button, derived) ──
function GroupTrigger({ view }: { view: GroupDisclosureView }) {
  const [open, setOpen] = useState(false);
  // The active tab may be hiding behind the chevron — hint at it, tab-style.
  const activeHidden = view.commands.some((c) => c.active);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={tabClass(activeHidden)}
      >
        <Icon name="chevronDown" size={18} />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <div className="min-w-44 p-1">
            {view.commands.map((c) => (
              <button
                key={c.id}
                type="button"
                role={view.role === 'tabs' ? 'menuitemradio' : 'menuitem'}
                aria-checked={view.role === 'tabs' ? c.active : undefined}
                disabled={!c.enabled}
                onClick={() => {
                  view.execute(c.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  c.active ? 'bg-selected text-accent' : 'text-fg-secondary hover:bg-hover'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </span>
  );
}

// ── the collapsed modes group — v2's mode-select-button, 1:1 ─────────────────
function CollapsedModes({ view }: { view: CollapsedGroupView }) {
  const [open, setOpen] = useState(false);
  const active = view.commands.find((c) => c.active) ?? view.commands[0];
  // v2 highlights the control whenever a non-default mode is active.
  const isActive = Boolean(active?.active && active.id !== 'mode:view');
  return (
    <div style={{ width: 100 }} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-surface hover:bg-hover flex w-full cursor-pointer appearance-none items-center rounded-md py-1.5 pl-3 pr-2 text-[13px] transition-colors"
      >
        <span
          className={`min-w-0 flex-1 truncate text-left ${isActive ? 'text-accent' : 'text-fg'}`}
        >
          {active?.label}
        </span>
        <Icon
          name="chevronDown"
          size={16}
          className={isActive ? 'text-accent' : 'text-fg-secondary'}
        />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <div className="min-w-44 p-1">
            {view.commands.map((c) => (
              <button
                key={c.id}
                type="button"
                role="menuitemradio"
                aria-checked={c.active}
                onClick={() => {
                  view.execute(c.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  c.active ? 'bg-selected text-accent' : 'text-fg-secondary hover:bg-hover'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

// ── the derived overflow menu ────────────────────────────────────────────────
function OverflowMenu({ view }: { view: OverflowMenuView }) {
  const t = useT();
  if (!view.isOpen) return null;
  return (
    <Popover onClose={view.close} align="end">
      <div className="min-w-56 p-1">
        {view.sections.map((section, i) => (
          <div key={i}>
            {i > 0 && <div className="bg-border-subtle my-1 h-px" />}
            {section.labelKey && (
              <div className="text-fg-muted px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide">
                {t(section.labelKey)}
              </div>
            )}
            {section.rows.map((row) => {
              const cmd = view.resolve(row.command);
              if (!cmd) return null;
              if (row.type === 'submenu') {
                return <InlineSubmenu key={row.command} menuId={row.menu} label={cmd.label} />;
              }
              return (
                <button
                  key={row.command}
                  type="button"
                  role={section.role === 'radio' ? 'menuitemradio' : 'menuitem'}
                  aria-checked={section.role === 'radio' ? cmd.active : undefined}
                  disabled={!cmd.enabled}
                  onClick={() => {
                    view.execute(row.command);
                    view.close();
                  }}
                  // Same blue-highlight selection as the dropdown menus — no
                  // checkmark; the icon column stays the command's own icon.
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    cmd.active ? 'bg-selected text-accent' : 'text-fg-secondary hover:bg-hover'
                  }`}
                >
                  {cmd.icon && (
                    <Icon name={cmd.icon} size={16} className={cmd.active ? '' : 'text-fg-muted'} />
                  )}
                  <span className="flex-1 truncate">{cmd.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Popover>
  );
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
      className={buttonClass(isOpen)}
    >
      <Icon name="dots" size={20} />
    </button>
  );
}

// ── the assembled toolbar ────────────────────────────────────────────────────
export function AppToolbar({ bar, className }: { bar: BarSchema; className?: string }) {
  return (
    <Toolbar
      bar={bar}
      gap={8} // v2 toolbar gap-2
      separatorWidth={1}
      className={className}
      renderCommand={(cmd, variant, run) => <CommandButton cmd={cmd} variant={variant} run={run} />}
      renderCustom={{
        'zoom-controls': (variant) => (variant === 'inline' ? <ZoomControls /> : <ZoomButton />),
      }}
      renderCollapsed={(view) => (view.id === 'modes' ? <CollapsedModes view={view} /> : undefined)}
      renderGroupTrigger={(view) => <GroupTrigger view={view} />}
      renderSeparator={() => <span className="bg-border h-6 w-px self-center" />}
      renderOverflowTrigger={(isOpen, toggle) => (
        <OverflowTrigger isOpen={isOpen} toggle={toggle} />
      )}
      renderOverflowMenu={(view) => <OverflowMenu view={view} />}
    />
  );
}
